package app.mimorii.push

import android.content.Context
import java.util.UUID

object PushStorage {
  private const val PREFERENCES = "mimorii_push"
  private const val DEVICE_KEY = "device_key"
  private const val INSTALLATION_ID = "installation_id"
  private const val PERMISSION_REQUESTED = "permission_requested"
  private const val ENABLED = "enabled"

  fun deviceKey(context: Context): String {
    val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    val existing = preferences.getString(DEVICE_KEY, null)
    if (existing != null) return existing
    val value = UUID.randomUUID().toString()
    preferences.edit().putString(DEVICE_KEY, value).apply()
    return value
  }

  fun installationId(context: Context): String? =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .getString(INSTALLATION_ID, null)

  fun saveInstallationId(context: Context, value: String) {
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putString(INSTALLATION_ID, value)
      .apply()
  }

  fun clearInstallationId(context: Context) {
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .remove(INSTALLATION_ID)
      .apply()
  }

  fun enabled(context: Context): Boolean =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .getBoolean(ENABLED, false)

  fun setEnabled(context: Context, value: Boolean) {
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(ENABLED, value)
      .apply()
  }

  fun permissionRequested(context: Context): Boolean =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .getBoolean(PERMISSION_REQUESTED, false)

  fun markPermissionRequested(context: Context) {
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(PERMISSION_REQUESTED, true)
      .apply()
  }
}
