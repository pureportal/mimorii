package app.mimorii.agentmobile

import android.content.Context
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import org.json.JSONObject

class AgentAuthenticationException : Exception("Agent key was rejected")

class PermanentSubmissionException(message: String) : Exception(message)

data class DeviceStatusSubmissionResponse(
  val acceptedAt: String,
  val collectionIntervalSeconds: Long
)

class DeviceStatusReporter(
  context: Context,
  private val enrollment: AgentMobileEnrollment,
  private val payload: String
) {
  private val userAgent = "mimorii-agent-mobile/${appVersion(context)}"

  @Volatile
  private var cancelled = false

  @Volatile
  private var activeConnection: HttpURLConnection? = null

  fun submit(): DeviceStatusSubmissionResponse {
    ensureActive()
    val body = payload.toByteArray(StandardCharsets.UTF_8)
    val connection = URL("${enrollment.serverUrl}/agent/device-status")
      .openConnection() as HttpURLConnection
    activeConnection = connection
    try {
      ensureActive()
      connection.requestMethod = "POST"
      connection.instanceFollowRedirects = false
      connection.connectTimeout = 10_000
      connection.readTimeout = 30_000
      connection.doOutput = true
      connection.setFixedLengthStreamingMode(body.size)
      connection.setRequestProperty("Authorization", "Bearer ${enrollment.enrollmentKey}")
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("Accept", "application/json")
      connection.setRequestProperty("User-Agent", userAgent)
      ensureActive()
      connection.outputStream.use { output -> output.write(body) }
      ensureActive()
      val statusCode = connection.responseCode
      validateStatus(statusCode)
      ensureActive()
      val response = connection.inputStream.bufferedReader(StandardCharsets.UTF_8).use {
        it.readText()
      }
      return parseResponse(response)
    } finally {
      activeConnection = null
      connection.disconnect()
    }
  }

  fun cancel() {
    cancelled = true
    activeConnection?.disconnect()
  }

  fun isCancelled(): Boolean = cancelled

  private fun ensureActive() {
    if (cancelled) throw IOException("Device status submission was cancelled")
  }

  private fun appVersion(context: Context): String =
    requireNotNull(context.packageManager.getPackageInfo(context.packageName, 0).versionName)

  companion object {
    internal fun validateStatus(statusCode: Int) {
      if (statusCode == HttpURLConnection.HTTP_UNAUTHORIZED ||
        statusCode == HttpURLConnection.HTTP_FORBIDDEN
      ) {
        throw AgentAuthenticationException()
      }
      if (statusCode == HttpURLConnection.HTTP_CLIENT_TIMEOUT ||
        statusCode == 425 ||
        statusCode == 429 ||
        statusCode >= 500
      ) {
        throw IOException("Server returned status $statusCode")
      }
      if (statusCode !in 200..299) {
        throw PermanentSubmissionException("Server rejected device status with status $statusCode")
      }
    }

    internal fun parseResponse(response: String): DeviceStatusSubmissionResponse {
      val parsed = try {
        JSONObject(response)
      } catch (_: Exception) {
        throw PermanentSubmissionException("Server returned an invalid response")
      }
      val acceptedAt = try {
        Timestamps.canonical(parsed.getString("acceptedAt"))
      } catch (_: Exception) {
        throw PermanentSubmissionException("Server returned an invalid response")
      }
      val intervalValue = parsed.opt("collectionIntervalSeconds") as? Number
        ?: throw PermanentSubmissionException("Server returned an invalid response")
      val interval = intervalValue.toLong()
      if (intervalValue.toDouble() != interval.toDouble() || interval !in 900L..3_600L) {
        throw PermanentSubmissionException("Server returned an invalid collection interval")
      }
      return DeviceStatusSubmissionResponse(acceptedAt, interval)
    }
  }
}
