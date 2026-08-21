package app.mimorii.push

import com.google.firebase.messaging.RemoteMessage

data class PushNotification(
  val title: String,
  val body: String,
  val path: String,
  val tag: String,
  val warning: Boolean
) {
  companion object {
    fun from(message: RemoteMessage): PushNotification = PushNotification(
      title = message.notification?.title ?: message.data["title"] ?: "Mimorii",
      body = message.notification?.body ?: message.data["body"] ?: "",
      path = PushNavigation.path(message.data["path"]) ?: PushNavigation.DEFAULT_PATH,
      tag = message.data["tag"] ?: message.messageId ?: "mimorii",
      warning = message.data["severity"] != "info"
    )
  }
}
