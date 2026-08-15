package app.mimorii.agentmobile

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

class AgentAuthenticationException : Exception("Collector key was rejected")

class PermanentSubmissionException(message: String) : Exception(message)

object DeviceStatusReporter {
  fun submit(context: Context, enrollment: AgentMobileEnrollment): Long {
    val payload = DeviceStatusCollector.collect(context).toJson().toString()
    val connection = URL("${enrollment.serverUrl}/agent/device-status")
      .openConnection() as HttpURLConnection
    try {
      connection.requestMethod = "POST"
      connection.connectTimeout = 10_000
      connection.readTimeout = 30_000
      connection.doOutput = true
      connection.setRequestProperty("Authorization", "Bearer ${enrollment.enrollmentKey}")
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("User-Agent", "mimorii-agent-mobile/${appVersion(context)}")
      connection.outputStream.use { output ->
        output.write(payload.toByteArray(StandardCharsets.UTF_8))
      }
      val statusCode = connection.responseCode
      if (statusCode == HttpURLConnection.HTTP_UNAUTHORIZED || statusCode == HttpURLConnection.HTTP_FORBIDDEN) {
        throw AgentAuthenticationException()
      }
      if (statusCode == 429 || statusCode >= 500) {
        throw java.io.IOException("Server returned status $statusCode")
      }
      if (statusCode !in 200..299) {
        throw PermanentSubmissionException("Server rejected device status with status $statusCode")
      }
      val response = connection.inputStream.bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
      val interval = JSONObject(response).getLong("collectionIntervalSeconds")
      if (interval !in 900L..3_600L) {
        throw PermanentSubmissionException("Server returned an invalid collection interval")
      }
      return interval
    } finally {
      connection.disconnect()
    }
  }

  private fun appVersion(context: Context): String =
    requireNotNull(context.packageManager.getPackageInfo(context.packageName, 0).versionName)
}
