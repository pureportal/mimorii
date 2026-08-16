package app.mimorii.push

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

@SuppressLint("MissingFirebaseInstanceTokenRefresh")
class MimoriiFirebaseMessagingService : FirebaseMessagingService() {
  override fun onRegistered(installationId: String) {
    PushStorage.saveInstallationId(this, installationId)
  }

  override fun onUnregistered(installationId: String) {
    if (PushStorage.installationId(this) == installationId) {
      PushStorage.clearInstallationId(this)
    }
  }

  override fun onMessageReceived(message: RemoteMessage) {
    if (!PushStorage.enabled(this)) return
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
      PackageManager.PERMISSION_GRANTED
    ) return
    val notificationManager = NotificationManagerCompat.from(this)
    if (!notificationManager.areNotificationsEnabled()) return
    val title = message.notification?.title ?: message.data["title"] ?: "Mimorii"
    val body = message.notification?.body ?: message.data["body"] ?: ""
    val warning = message.data["severity"] != "info"
    val tag = message.data["tag"] ?: message.messageId ?: "mimorii"
    val path = PushNavigation.path(message.data["path"]) ?: PushNavigation.DEFAULT_PATH
    val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra("path", path)
    } ?: return
    val pendingIntent = PendingIntent.getActivity(
      this,
      tag.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val notification = NotificationCompat.Builder(
      this,
      if (warning) NotificationChannels.ALERTS else NotificationChannels.UPDATES
    )
      .setSmallIcon(R.drawable.ic_stat_mimorii)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setContentIntent(pendingIntent)
      .setAutoCancel(true)
      .setPriority(
        if (warning) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT
      )
      .build()
    notificationManager.notify(tag, 0, notification)
  }
}
