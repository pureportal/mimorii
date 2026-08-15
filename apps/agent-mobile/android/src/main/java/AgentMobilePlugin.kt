package app.mimorii.agentmobile

import android.app.Activity
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.net.URI
import java.util.UUID
import org.json.JSONObject

@InvokeArg
class EnrollArgs {
  lateinit var serverUrl: String
  lateinit var enrollmentKey: String
  lateinit var collectorId: String
  var collectionIntervalSeconds: Long = 0
}

@TauriPlugin
class AgentMobilePlugin(private val activity: Activity) : Plugin(activity) {
  override fun load(webView: WebView) {
    val enrollment = AgentMobileStorage.enrollment(activity)
    try {
      if (enrollment == null) {
        AgentMobileScheduler.cancel(activity)
      } else {
        AgentMobileScheduler.ensurePeriodic(activity, enrollment.collectionIntervalSeconds)
      }
    } catch (error: Exception) {
      if (enrollment != null) {
        AgentMobileStorage.recordError(
          activity,
          enrollment,
          error.message ?: "Background collection could not be scheduled"
        )
      }
    }
  }

  @Command
  fun status(invoke: Invoke) {
    invoke.resolve(state())
  }

  @Command
  fun enroll(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(EnrollArgs::class.java)
      val enrollment = AgentMobileEnrollment(
        serverUrl = normalizeServerUrl(args.serverUrl),
        enrollmentKey = validateEnrollmentKey(args.enrollmentKey),
        collectorId = UUID.fromString(args.collectorId).toString(),
        collectionIntervalSeconds = validateInterval(args.collectionIntervalSeconds),
        revision = UUID.randomUUID().toString()
      )
      AgentMobileStorage.saveEnrollment(activity, enrollment)
      try {
        AgentMobileScheduler.ensurePeriodic(activity, enrollment.collectionIntervalSeconds)
        AgentMobileScheduler.collectNow(activity)
      } catch (error: Exception) {
        AgentMobileStorage.recordError(
          activity,
          enrollment,
          error.message ?: "Background collection could not be scheduled"
        )
        throw error
      }
      invoke.resolve(state())
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Mobile collector enrollment failed")
    }
  }

  @Command
  fun collect_now(invoke: Invoke) {
    try {
      if (AgentMobileStorage.enrollment(activity) == null) {
        AgentMobileScheduler.cancel(activity)
        invoke.reject("Mobile collector is not enrolled")
        return
      }
      AgentMobileScheduler.collectNow(activity)
      invoke.resolve(state())
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Device status collection could not be scheduled")
    }
  }

  @Command
  fun unenroll(invoke: Invoke) {
    try {
      AgentMobileScheduler.cancel(activity)
      AgentMobileStorage.clearEnrollment(activity)
      invoke.resolve(state())
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Mobile collector could not be disconnected")
    }
  }

  private fun state(): JSObject {
    val enrollment = AgentMobileStorage.enrollment(activity)
    return JSObject().apply {
      put("available", true)
      put("enrolled", enrollment != null)
      put(
        "collectorId",
        enrollment?.collectorId ?: AgentMobileStorage.collectorId(activity) ?: JSONObject.NULL
      )
      put(
        "collectionIntervalSeconds",
        enrollment?.collectionIntervalSeconds ?: JSONObject.NULL
      )
      put("lastSubmittedAt", AgentMobileStorage.lastSubmittedAt(activity) ?: JSONObject.NULL)
      put("lastError", AgentMobileStorage.lastError(activity) ?: JSONObject.NULL)
    }
  }

  private fun normalizeServerUrl(value: String): String {
    val uri = URI(value.trim())
    require(uri.scheme == "https" || uri.scheme == "http") { "Server must use HTTP or HTTPS" }
    require(uri.host != null) { "Server URL is invalid" }
    if (uri.scheme == "http") {
      require(uri.host in setOf("localhost", "127.0.0.1", "::1")) {
        "HTTP exposes the collector key; use HTTPS"
      }
    }
    require(uri.query == null && uri.fragment == null && uri.userInfo == null) {
      "Server URL is invalid"
    }
    val path = uri.path.trimEnd('/').let { if (it.endsWith("/api")) it else "$it/api" }
    return URI(uri.scheme, null, uri.host, uri.port, path, null, null).toString().trimEnd('/')
  }

  private fun validateEnrollmentKey(value: String): String = value.trim().also {
    require(it.startsWith("mim_agent_") && it.length >= 40) { "Collector key is invalid" }
  }

  private fun validateInterval(value: Long): Long = value.also {
    require(it in 900L..3_600L) { "Collection interval must be between 900 and 3600 seconds" }
  }
}
