package app.mimorii.agentmobile

import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AgentMobilePluginTest {
  @Test
  fun acceptsIpv6LoopbackForLocalDevelopment() {
    assertEquals(
      "http://[::1]:4310/api",
      normalizeMobileServerUrl(" http://[::1]:4310/ ")
    )
  }

  @Test
  fun rejectsCleartextRemoteServers() {
    assertThrows(IllegalArgumentException::class.java) {
      normalizeMobileServerUrl("http://collector.example.com")
    }
  }

  @Test
  fun acceptsVerifiedMobileEnrollment() {
    val collectorId = UUID.randomUUID().toString()
    val enrollment = enrollmentFromResponse(
      "https://monitor.example/api",
      "mim_agent_test_key_that_is_long_enough_for_enrollment",
      """{
        "collectorId":"$collectorId",
        "name":"Field phone",
        "kind":"mobile",
        "collectionIntervalSeconds":900
      }"""
    )

    assertEquals(collectorId, enrollment.collectorId)
    assertEquals("Field phone", enrollment.collectorName)
    assertEquals(900L, enrollment.collectionIntervalSeconds)
  }

  @Test
  fun rejectsDesktopEnrollment() {
    assertThrows(IllegalArgumentException::class.java) {
      enrollmentFromResponse(
        "https://monitor.example/api",
        "mim_agent_test_key_that_is_long_enough_for_enrollment",
        """{
          "collectorId":"${UUID.randomUUID()}",
          "name":"Office host",
          "kind":"desktop",
          "collectionIntervalSeconds":900
        }"""
      )
    }
  }
}
