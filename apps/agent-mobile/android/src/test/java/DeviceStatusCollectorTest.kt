package app.mimorii.agentmobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeviceStatusCollectorTest {
  @Test
  fun boundsDeviceValuesToTheSubmissionContract() {
    assertEquals(
      "m".repeat(100),
      DeviceStatusCollector.requiredText(" ${"m".repeat(120)} ", "model", 100)
    )
    assertEquals("2026-08-01", DeviceStatusCollector.optionalText(" 2026-08-01 ", 40))
    assertNull(DeviceStatusCollector.optionalText("  ", 40))
    assertEquals(0L, DeviceStatusCollector.boundedAvailableBytes(-1, 100))
    assertEquals(100L, DeviceStatusCollector.boundedAvailableBytes(101, 100))
  }

  @Test
  fun ignoresInvalidBatteryReadings() {
    assertEquals(50.0, DeviceStatusCollector.batteryPercent(5, 10)!!, 0.0)
    assertNull(DeviceStatusCollector.batteryPercent(-1, 10))
    assertNull(DeviceStatusCollector.batteryPercent(11, 10))
    assertNull(DeviceStatusCollector.batteryPercent(1, 0))
    assertEquals(31.2, DeviceStatusCollector.batteryTemperature(312)!!, 0.0)
    assertNull(DeviceStatusCollector.batteryTemperature(Int.MIN_VALUE))
    assertNull(DeviceStatusCollector.batteryTemperature(2_001))
  }
}
