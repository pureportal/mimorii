package app.mimorii.agentmobile

import android.content.Context
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.UUID
import org.json.JSONObject

class AgentEnrollmentVerifier(private val context: Context) {
  fun verify(serverUrl: String, enrollmentKey: String): AgentMobileEnrollment {
    val normalizedServerUrl = normalizeMobileServerUrl(serverUrl)
    val normalizedKey = validateEnrollmentKey(enrollmentKey)
    val connection = URL("$normalizedServerUrl/agent/enrollment")
      .openConnection() as HttpURLConnection
    try {
      connection.requestMethod = "GET"
      connection.instanceFollowRedirects = false
      connection.connectTimeout = 10_000
      connection.readTimeout = 20_000
      connection.setRequestProperty("Authorization", "Bearer $normalizedKey")
      connection.setRequestProperty("Accept", "application/json")
      connection.setRequestProperty("User-Agent", userAgent())
      val statusCode = connection.responseCode
      if (statusCode == HttpURLConnection.HTTP_UNAUTHORIZED ||
        statusCode == HttpURLConnection.HTTP_FORBIDDEN
      ) {
        throw IllegalArgumentException("Enrollment key was rejected")
      }
      if (statusCode !in 200..299) {
        throw IllegalStateException("Server returned status $statusCode")
      }
      val response = connection.inputStream.bufferedReader(StandardCharsets.UTF_8).use {
        it.readText()
      }
      return enrollmentFromResponse(normalizedServerUrl, normalizedKey, response)
    } finally {
      connection.disconnect()
    }
  }

  private fun userAgent(): String {
    val version = requireNotNull(
      context.packageManager.getPackageInfo(context.packageName, 0).versionName
    )
    return "mimorii-agent-mobile/$version"
  }
}

internal fun enrollmentFromResponse(
  serverUrl: String,
  enrollmentKey: String,
  response: String
): AgentMobileEnrollment {
  val parsed = try {
    JSONObject(response)
  } catch (error: Exception) {
    throw IllegalArgumentException("Server returned invalid enrollment", error)
  }
  require(parsed.optString("kind") == "mobile") { "Enrollment is not for an Android collector" }
  val collectorId = try {
    UUID.fromString(parsed.getString("collectorId")).toString()
  } catch (error: Exception) {
    throw IllegalArgumentException("Server returned invalid enrollment", error)
  }
  val name = parsed.optString("name").trim()
  require(name.isNotEmpty() && name.length <= 100) { "Server returned invalid enrollment" }
  val intervalValue = parsed.opt("collectionIntervalSeconds") as? Number
    ?: throw IllegalArgumentException("Server returned invalid enrollment")
  val interval = intervalValue.toLong()
  require(intervalValue.toDouble() == interval.toDouble() && interval in 900L..3_600L) {
    "Server returned invalid enrollment"
  }
  return AgentMobileEnrollment(
    serverUrl = serverUrl,
    enrollmentKey = enrollmentKey,
    collectorId = collectorId,
    collectorName = name,
    collectionIntervalSeconds = interval,
    revision = UUID.randomUUID().toString()
  )
}

internal fun validateEnrollmentKey(value: String): String = value.trim().also {
  require(it.startsWith("mim_agent_") && it.length >= 40) { "Enrollment key is invalid" }
}

internal fun normalizeMobileServerUrl(value: String): String {
  val uri = URI(value.trim())
  require(uri.scheme == "https" || uri.scheme == "http") { "Server must use HTTP or HTTPS" }
  require(uri.host != null) { "Server URL is invalid" }
  if (uri.scheme == "http") {
    require(uri.host in setOf("localhost", "127.0.0.1", "::1", "[::1]")) {
      "HTTP exposes the enrollment key; use HTTPS"
    }
  }
  require(uri.query == null && uri.fragment == null && uri.userInfo == null) {
    "Server URL is invalid"
  }
  val path = uri.path.trimEnd('/').let { if (it.endsWith("/api")) it else "$it/api" }
  return URI(uri.scheme, null, uri.host, uri.port, path, null, null).toString().trimEnd('/')
}
