package app.mimorii.agentmobile

import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DeviceStatusReporterTest {
  @Test
  fun parsesAcceptedSubmissionResponse() {
    val response = DeviceStatusReporter.parseResponse(
      """{"acceptedAt":"2026-08-15T10:00:00.000Z","collectionIntervalSeconds":1800}"""
    )

    assertEquals("2026-08-15T10:00:00.000Z", response.acceptedAt)
    assertEquals(1_800L, response.collectionIntervalSeconds)
  }

  @Test
  fun rejectsInvalidSubmissionResponses() {
    assertThrows(PermanentSubmissionException::class.java) {
      DeviceStatusReporter.parseResponse(
        """{"acceptedAt":"invalid","collectionIntervalSeconds":900}"""
      )
    }
    assertThrows(PermanentSubmissionException::class.java) {
      DeviceStatusReporter.parseResponse(
        """{"acceptedAt":"2026-08-15T10:00:00.000Z","collectionIntervalSeconds":899}"""
      )
    }
    assertThrows(PermanentSubmissionException::class.java) {
      DeviceStatusReporter.parseResponse(
        """{"acceptedAt":"2026-08-15T10:00:00.000Z","collectionIntervalSeconds":900.5}"""
      )
    }
  }

  @Test
  fun classifiesHttpFailuresForRetryAndReconnect() {
    DeviceStatusReporter.validateStatus(200)
    DeviceStatusReporter.validateStatus(299)

    listOf(401, 403).forEach { statusCode ->
      assertThrows(AgentAuthenticationException::class.java) {
        DeviceStatusReporter.validateStatus(statusCode)
      }
    }
    listOf(408, 425, 429, 500, 503).forEach { statusCode ->
      assertThrows(IOException::class.java) {
        DeviceStatusReporter.validateStatus(statusCode)
      }
    }
    listOf(300, 400, 404, 409).forEach { statusCode ->
      assertThrows(PermanentSubmissionException::class.java) {
        DeviceStatusReporter.validateStatus(statusCode)
      }
    }
  }
}
