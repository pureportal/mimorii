package app.mimorii.push

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.webkit.WebView
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.firebase.FirebaseApp
import com.google.firebase.installations.FirebaseInstallations
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject

@TauriPlugin(
  permissions = [
    Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "postNotification")
  ]
)
class PushPlugin(private val activity: Activity) : Plugin(activity) {
  private var webView: WebView? = null
  private var pendingPath = PushNavigation.path(activity.intent.getStringExtra("path"))

  override fun load(webView: WebView) {
    this.webView = webView
  }

  override fun onNewIntent(intent: Intent) {
    val path = PushNavigation.path(intent.getStringExtra("path")) ?: return
    val currentWebView = webView
    if (currentWebView == null) {
      pendingPath = path
      return
    }
    currentWebView.post {
      currentWebView.evaluateJavascript(
        "window.location.assign(${JSONObject.quote(path)})",
        null
      )
    }
  }

  @Command
  fun status(invoke: Invoke) {
    val response = state()
    response.put("launchPath", pendingPath)
    pendingPath = null
    invoke.resolve(response)
  }

  @Command
  fun mark_permission_requested(invoke: Invoke) {
    PushStorage.markPermissionRequested(activity)
    invoke.resolve()
  }

  @Command
  fun enable(invoke: Invoke) {
    PushStorage.setEnabled(activity, false)
    if (!configured()) {
      invoke.reject("Firebase is not configured")
      return
    }
    if (!permissionGranted()) {
      invoke.reject("Notification permission was denied")
      return
    }
    val messaging = FirebaseMessaging.getInstance()
    messaging.isAutoInitEnabled = true
    messaging.register()
      .continueWithTask { task ->
        if (!task.isSuccessful) throw task.exception ?: IllegalStateException("Registration failed")
        FirebaseInstallations.getInstance().id
      }
      .addOnSuccessListener { installationId ->
        PushStorage.saveInstallationId(activity, installationId)
        PushStorage.setEnabled(activity, true)
        invoke.resolve(state())
      }
      .addOnFailureListener { error -> invoke.reject(error.message ?: "Firebase registration failed") }
  }

  @Command
  fun disable(invoke: Invoke) {
    PushStorage.setEnabled(activity, false)
    if (!configured()) {
      PushStorage.clearInstallationId(activity)
      invoke.resolve(state())
      return
    }
    val messaging = FirebaseMessaging.getInstance()
    messaging.isAutoInitEnabled = false
    messaging.unregister()
      .continueWithTask { task ->
        if (!task.isSuccessful) throw task.exception ?: IllegalStateException("Unregistration failed")
        FirebaseInstallations.getInstance().delete()
      }
      .addOnSuccessListener {
        PushStorage.clearInstallationId(activity)
        invoke.resolve(state())
      }
      .addOnFailureListener { error -> invoke.reject(error.message ?: "Firebase unregistration failed") }
  }

  private fun state(): JSObject {
    val response = JSObject()
    response.put("configured", configured())
    response.put("deviceKey", PushStorage.deviceKey(activity))
    response.put("installationId", PushStorage.installationId(activity))
    response.put("permission", permissionState())
    response.put("enabled", PushStorage.enabled(activity))
    return response
  }

  private fun configured(): Boolean =
    MimoriiApplication.firebaseConfigured() && FirebaseApp.getApps(activity).isNotEmpty()

  private fun permissionState(): String {
    if (permissionGranted()) return "granted"
    return if (PushStorage.permissionRequested(activity)) "denied" else "prompt"
  }

  private fun permissionGranted(): Boolean =
    (
      Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
    ) && NotificationManagerCompat.from(activity).areNotificationsEnabled()
}
