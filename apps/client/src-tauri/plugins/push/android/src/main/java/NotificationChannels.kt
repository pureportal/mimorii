package app.mimorii.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object NotificationChannels {
  const val ALERTS = "monitoring_alerts"
  const val UPDATES = "monitoring_updates"

  fun create(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannels(
      listOf(
        NotificationChannel(ALERTS, "Monitoring alerts", NotificationManager.IMPORTANCE_HIGH),
        NotificationChannel(UPDATES, "Monitoring updates", NotificationManager.IMPORTANCE_DEFAULT)
      )
    )
  }
}
