package app.mimorii.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PushNavigationTest {
  @Test
  fun acceptsAppDestinations() {
    assertEquals("/app/resources/resource-1", PushNavigation.path("/app/resources/resource-1"))
  }

  @Test
  fun rejectsExternalAndAuthenticationDestinations() {
    assertNull(PushNavigation.path("https://attacker.example/app"))
    assertNull(PushNavigation.path("/login"))
  }
}
