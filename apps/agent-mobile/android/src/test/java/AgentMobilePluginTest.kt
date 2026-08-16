package app.mimorii.agentmobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

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
}
