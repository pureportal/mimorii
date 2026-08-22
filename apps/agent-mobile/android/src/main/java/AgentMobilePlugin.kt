package app.mimorii.agentmobile

import android.app.Activity
import android.app.ActivityManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.concurrent.Executors
import org.json.JSONObject

@InvokeArg
class EnrollArgs {
  lateinit var serverUrl: String
  lateinit var enrollmentKey: String
}

@TauriPlugin
class AgentMobilePlugin(private val activity: Activity) : Plugin(activity) {
  private val commands = Executors.newSingleThreadExecutor()

  override fun load(webView: WebView) {
    AgentMobileLifecycle.reconcile(activity)
  }

  @Command
  fun status(invoke: Invoke) {
    AgentMobileLifecycle.reconcile(activity)
    invoke.resolve(state())
  }

  @Command
  fun enroll(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(EnrollArgs::class.java)
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Enrollment details are invalid")
      return
    }
    commands.execute {
      try {
        val enrollment = AgentEnrollmentVerifier(activity).verify(
          args.serverUrl,
          args.enrollmentKey
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
        activity.runOnUiThread { invoke.resolve(state()) }
      } catch (error: Exception) {
        activity.runOnUiThread {
          invoke.reject(error.message ?: "Android agent enrollment failed")
        }
      }
    }
  }

  @Command
  fun collect_now(invoke: Invoke) {
    try {
      if (AgentMobileStorage.enrollment(activity) == null) {
        AgentMobileScheduler.cancel(activity)
        invoke.reject("Android agent is not enrolled")
        return
      }
      AgentMobileScheduler.collectNow(activity)
      invoke.resolve(state())
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Device status collection could not be scheduled")
    }
  }

  @Command
  fun open_background_settings(invoke: Invoke) {
    if (!isBackgroundRestricted()) {
      invoke.reject("Background access is already allowed")
      return
    }
    try {
      activity.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
          data = Uri.parse("package:${activity.packageName}")
        }
      )
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Android settings could not be opened")
    }
  }

  @Command
  fun unenroll(invoke: Invoke) {
    try {
      AgentMobileScheduler.cancel(activity)
      AgentMobileStorage.clearEnrollment(activity)
      invoke.resolve(state())
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Android agent could not be disconnected")
    }
  }

  private fun state(): JSObject {
    val enrollment = AgentMobileStorage.enrollment(activity)
    val backgroundRestricted = isBackgroundRestricted()
    val powerManager = activity.getSystemService(PowerManager::class.java)
    return JSObject().apply {
      put("available", true)
      put("enrolled", enrollment != null)
      put(
        "agentId",
        enrollment?.agentId ?: AgentMobileStorage.agentId(activity) ?: JSONObject.NULL
      )
      put("agentName", enrollment?.agentName ?: JSONObject.NULL)
      put("serverUrl", enrollment?.serverUrl ?: JSONObject.NULL)
      put(
        "collectionIntervalSeconds",
        enrollment?.collectionIntervalSeconds ?: JSONObject.NULL
      )
      put("lastSubmittedAt", AgentMobileStorage.lastSubmittedAt(activity) ?: JSONObject.NULL)
      put("lastError", AgentMobileStorage.lastError(activity) ?: JSONObject.NULL)
      put(
        "backgroundMode",
        when {
          enrollment == null -> "inactive"
          backgroundRestricted -> "restricted"
          else -> "scheduled"
        }
      )
      put("backgroundRestricted", backgroundRestricted)
      put(
        "batteryOptimizationExempt",
        powerManager.isIgnoringBatteryOptimizations(activity.packageName)
      )
      put("bootRecoveryEnabled", true)
      put("foregroundService", false)
      put("notificationPermissionRequired", false)
    }
  }

  private fun isBackgroundRestricted(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
      activity.getSystemService(ActivityManager::class.java).isBackgroundRestricted
}
