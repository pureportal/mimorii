package app.mimorii.push

import com.google.firebase.messaging.RemoteMessage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PushNotificationTest {
  @Test
  fun readsServerPayloadForNativeDelivery() {
    val message = RemoteMessage.Builder("mimorii")
      .setMessageId("message-1")
      .setData(
        mapOf(
          "title" to "Server is down",
          "body" to "Website has stopped responding",
          "path" to "/app/resources/resource-1",
          "tag" to "incident-1",
          "severity" to "warning"
        )
      )
      .build()

    val notification = PushNotification.from(message)

    assertEquals("Server is down", notification.title)
    assertEquals("Website has stopped responding", notification.body)
    assertEquals("/app/resources/resource-1", notification.path)
    assertEquals("incident-1", notification.tag)
    assertTrue(notification.warning)
  }
}
