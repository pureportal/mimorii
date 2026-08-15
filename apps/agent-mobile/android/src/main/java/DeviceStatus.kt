package app.mimorii.agentmobile

import org.json.JSONObject

data class DeviceIdentity(
  val manufacturer: String,
  val model: String,
  val androidRelease: String,
  val apiLevel: Int,
  val securityPatch: String?
) {
  fun toJson(): JSONObject = JSONObject()
    .put("manufacturer", manufacturer)
    .put("model", model)
    .put("androidRelease", androidRelease)
    .put("apiLevel", apiLevel)
    .putNullable("securityPatch", securityPatch)
}

data class CollectorBuild(
  val appVersion: String,
  val buildNumber: Long
) {
  fun toJson(): JSONObject = JSONObject()
    .put("appVersion", appVersion)
    .put("buildNumber", buildNumber)
}

data class BatteryStatus(
  val percent: Double?,
  val charging: Boolean?,
  val powerSource: String,
  val health: String?,
  val temperatureCelsius: Double?
) {
  fun toJson(): JSONObject = JSONObject()
    .putNullable("percent", percent)
    .putNullable("charging", charging)
    .put("powerSource", powerSource)
    .putNullable("health", health)
    .putNullable("temperatureCelsius", temperatureCelsius)
}

data class MemoryStatus(
  val totalBytes: Long,
  val availableBytes: Long,
  val lowMemory: Boolean
) {
  fun toJson(): JSONObject = JSONObject()
    .put("totalBytes", totalBytes)
    .put("availableBytes", availableBytes)
    .put("lowMemory", lowMemory)
}

data class StorageStatus(
  val totalBytes: Long,
  val availableBytes: Long
) {
  fun toJson(): JSONObject = JSONObject()
    .put("totalBytes", totalBytes)
    .put("availableBytes", availableBytes)
}

data class ConnectivityStatus(
  val connected: Boolean,
  val internetValidated: Boolean,
  val metered: Boolean,
  val roaming: Boolean?,
  val vpn: Boolean,
  val transport: String
) {
  fun toJson(): JSONObject = JSONObject()
    .put("connected", connected)
    .put("internetValidated", internetValidated)
    .put("metered", metered)
    .putNullable("roaming", roaming)
    .put("vpn", vpn)
    .put("transport", transport)
}

data class PowerStatus(
  val batterySaver: Boolean,
  val deviceIdle: Boolean,
  val backgroundRestricted: Boolean?
) {
  fun toJson(): JSONObject = JSONObject()
    .put("batterySaver", batterySaver)
    .put("deviceIdle", deviceIdle)
    .putNullable("backgroundRestricted", backgroundRestricted)
}

data class DeviceStatus(
  val observedAt: String,
  val device: DeviceIdentity,
  val collector: CollectorBuild,
  val uptimeSeconds: Long,
  val battery: BatteryStatus,
  val memory: MemoryStatus,
  val storage: StorageStatus,
  val connectivity: ConnectivityStatus,
  val power: PowerStatus,
  val thermalStatus: String?
) {
  fun toJson(): JSONObject = JSONObject()
    .put("schemaVersion", 1)
    .put("observedAt", observedAt)
    .put("device", device.toJson())
    .put("collector", collector.toJson())
    .put("uptimeSeconds", uptimeSeconds)
    .put("battery", battery.toJson())
    .put("memory", memory.toJson())
    .put("storage", storage.toJson())
    .put("connectivity", connectivity.toJson())
    .put("power", power.toJson())
    .putNullable("thermalStatus", thermalStatus)
}

private fun JSONObject.putNullable(name: String, value: Any?): JSONObject {
  if (value != null) put(name, value)
  return this
}
