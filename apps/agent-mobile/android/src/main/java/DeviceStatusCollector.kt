package app.mimorii.agentmobile

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock

object DeviceStatusCollector {
  fun collect(context: Context): DeviceStatus {
    val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
    val memoryInfo = ActivityManager.MemoryInfo()
    val activityManager = context.getSystemService(ActivityManager::class.java)
    activityManager.getMemoryInfo(memoryInfo)
    val files = context.filesDir
    val powerManager = context.getSystemService(PowerManager::class.java)
    val totalMemoryBytes = memoryInfo.totalMem.coerceAtLeast(0)
    val totalStorageBytes = files.totalSpace.coerceAtLeast(0)

    return DeviceStatus(
      observedAt = Timestamps.now(),
      device = DeviceIdentity(
        manufacturer = requiredText(Build.MANUFACTURER, "manufacturer", 100),
        model = requiredText(Build.MODEL, "model", 100),
        androidRelease = requiredText(Build.VERSION.RELEASE, "Android release", 40),
        apiLevel = Build.VERSION.SDK_INT,
        securityPatch = optionalText(Build.VERSION.SECURITY_PATCH, 40)
      ),
      collector = CollectorBuild(
        appVersion = requiredText(
          requireNotNull(packageInfo.versionName) { "Application version is unavailable" },
          "Application version",
          40
        ),
        buildNumber = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          packageInfo.longVersionCode
        } else {
          @Suppress("DEPRECATION")
          packageInfo.versionCode.toLong()
        }
      ),
      uptimeSeconds = SystemClock.elapsedRealtime() / 1_000,
      battery = battery(context),
      memory = MemoryStatus(
        totalBytes = totalMemoryBytes,
        availableBytes = boundedAvailableBytes(memoryInfo.availMem, totalMemoryBytes),
        lowMemory = memoryInfo.lowMemory
      ),
      storage = StorageStatus(
        totalBytes = totalStorageBytes,
        availableBytes = boundedAvailableBytes(files.usableSpace, totalStorageBytes)
      ),
      connectivity = connectivity(context),
      power = PowerStatus(
        batterySaver = powerManager.isPowerSaveMode,
        deviceIdle = powerManager.isDeviceIdleMode,
        backgroundRestricted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          activityManager.isBackgroundRestricted
        } else {
          null
        }
      ),
      thermalStatus = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        thermalStatus(powerManager.currentThermalStatus)
      } else {
        null
      }
    )
  }

  private fun battery(context: Context): BatteryStatus {
    val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    if (intent == null) {
      return BatteryStatus(null, null, "unknown", null, null)
    }
    val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
    val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
    val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
    val plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)
    val health = intent.getIntExtra(BatteryManager.EXTRA_HEALTH, -1)
    val temperature = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
    val charging = when (status) {
      BatteryManager.BATTERY_STATUS_CHARGING,
      BatteryManager.BATTERY_STATUS_FULL -> true
      BatteryManager.BATTERY_STATUS_DISCHARGING,
      BatteryManager.BATTERY_STATUS_NOT_CHARGING -> false
      else -> null
    }
    return BatteryStatus(
      percent = batteryPercent(level, scale),
      charging = charging,
      powerSource = powerSource(plugged),
      health = batteryHealth(health),
      temperatureCelsius = batteryTemperature(temperature)
    )
  }

  private fun connectivity(context: Context): ConnectivityStatus {
    val manager = context.getSystemService(ConnectivityManager::class.java)
    val capabilities = manager.activeNetwork?.let(manager::getNetworkCapabilities)
    val connected = capabilities != null
    val vpn = capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true
    return ConnectivityStatus(
      connected = connected,
      internetValidated = capabilities?.hasCapability(
        NetworkCapabilities.NET_CAPABILITY_VALIDATED
      ) == true,
      metered = connected && manager.isActiveNetworkMetered,
      roaming = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_ROAMING)?.not()
      } else {
        null
      },
      vpn = vpn,
      transport = networkTransport(capabilities, vpn)
    )
  }

  private fun networkTransport(capabilities: NetworkCapabilities?, vpn: Boolean): String {
    if (capabilities == null) return "none"
    if (vpn) return "vpn"
    return when {
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH) -> "bluetooth"
      else -> "other"
    }
  }

  private fun powerSource(value: Int): String = when (value) {
    0 -> "none"
    BatteryManager.BATTERY_PLUGGED_AC -> "ac"
    BatteryManager.BATTERY_PLUGGED_USB -> "usb"
    BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"
    BatteryManager.BATTERY_PLUGGED_DOCK -> "dock"
    else -> "unknown"
  }

  private fun batteryHealth(value: Int): String? = when (value) {
    BatteryManager.BATTERY_HEALTH_GOOD -> "good"
    BatteryManager.BATTERY_HEALTH_OVERHEAT -> "overheat"
    BatteryManager.BATTERY_HEALTH_DEAD -> "dead"
    BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "over-voltage"
    BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "failure"
    BatteryManager.BATTERY_HEALTH_COLD -> "cold"
    BatteryManager.BATTERY_HEALTH_UNKNOWN -> "unknown"
    else -> null
  }

  private fun thermalStatus(value: Int): String? = when (value) {
    PowerManager.THERMAL_STATUS_NONE -> "none"
    PowerManager.THERMAL_STATUS_LIGHT -> "light"
    PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
    PowerManager.THERMAL_STATUS_SEVERE -> "severe"
    PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
    PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
    PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
    else -> null
  }

  internal fun requiredText(value: String, label: String, maximumLength: Int): String =
    value.trim().also { require(it.isNotEmpty()) { "$label is unavailable" } }.take(maximumLength)

  internal fun optionalText(value: String, maximumLength: Int): String? =
    value.trim().ifEmpty { null }?.take(maximumLength)

  internal fun boundedAvailableBytes(availableBytes: Long, totalBytes: Long): Long =
    availableBytes.coerceIn(0, totalBytes)

  internal fun batteryPercent(level: Int, scale: Int): Double? =
    if (scale > 0 && level in 0..scale) level.toDouble() * 100 / scale else null

  internal fun batteryTemperature(value: Int): Double? =
    if (value in -1_000..2_000) value / 10.0 else null
}
