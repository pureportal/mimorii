package app.mimorii.agentmobile

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

data class AgentMobileEnrollment(
  val serverUrl: String,
  val enrollmentKey: String,
  val agentId: String,
  val agentName: String,
  val collectionIntervalSeconds: Long,
  val revision: String
)

data class PendingDeviceStatusSubmission(
  val id: String,
  val agentId: String,
  val payload: String
)

object AgentMobileStorage {
  private const val PREFERENCES = "mimorii_agent_mobile"
  private const val SERVER_URL = "server_url"
  private const val ENROLLMENT_KEY = "enrollment_key"
  private const val AGENT_ID = "agent_id"
  private const val AGENT_NAME = "agent_name"
  private const val COLLECTION_INTERVAL_SECONDS = "collection_interval_seconds"
  private const val ENROLLMENT_REVISION = "enrollment_revision"
  private const val PENDING_SUBMISSION_ID = "pending_submission_id"
  private const val PENDING_SUBMISSION_AGENT_ID = "pending_submission_agent_id"
  private const val PENDING_SUBMISSION_PAYLOAD = "pending_submission_payload"
  private const val LAST_SUBMITTED_AT = "last_submitted_at"
  private const val LAST_ERROR = "last_error"
  private const val KEYSTORE = "AndroidKeyStore"
  private const val KEY_ALIAS = "mimorii_agent_mobile_key"

  @Synchronized
  fun saveEnrollment(context: Context, enrollment: AgentMobileEnrollment) {
    val preferences = preferences(context)
    val previousAgentId = agentId(context)
    val editor = preferences.edit()
      .putString(SERVER_URL, enrollment.serverUrl)
      .putString(ENROLLMENT_KEY, encrypt(enrollment.enrollmentKey))
      .putString(AGENT_ID, enrollment.agentId)
      .putString(AGENT_NAME, enrollment.agentName)
      .putLong(COLLECTION_INTERVAL_SECONDS, enrollment.collectionIntervalSeconds)
      .putString(ENROLLMENT_REVISION, enrollment.revision)
      .remove(LAST_ERROR)
    if (previousAgentId != enrollment.agentId) {
      editor.remove(LAST_SUBMITTED_AT)
      clearPendingSubmission(editor)
    }
    persist(editor, "Mobile agent enrollment could not be saved")
  }

  @Synchronized
  fun enrollment(context: Context): AgentMobileEnrollment? {
    val preferences = preferences(context)
    val hasCredentials = preferences.contains(SERVER_URL) ||
      preferences.contains(ENROLLMENT_KEY) ||
      preferences.contains(AGENT_NAME) ||
      preferences.contains(COLLECTION_INTERVAL_SECONDS) ||
      preferences.contains(ENROLLMENT_REVISION)
    if (!hasCredentials) return null
    return try {
      val serverUrl = requireNotNull(preferences.getString(SERVER_URL, null))
      val encryptedKey = requireNotNull(preferences.getString(ENROLLMENT_KEY, null))
      val agentId = canonicalUuid(preferences.getString(AGENT_ID, null))
      val agentName = requireNotNull(preferences.getString(AGENT_NAME, null)).trim()
      require(agentName.isNotEmpty() && agentName.length <= 100)
      val interval = preferences.getLong(COLLECTION_INTERVAL_SECONDS, 0)
      val revision = canonicalUuid(preferences.getString(ENROLLMENT_REVISION, null))
      require(interval in 900L..3_600L)
      AgentMobileEnrollment(
        serverUrl,
        decrypt(encryptedKey),
        agentId,
        agentName,
        interval,
        revision
      )
    } catch (_: Exception) {
      invalidateEnrollmentState(
        context,
        "Saved enrollment could not be read; reconnect the mobile agent"
      )
      null
    }
  }

  @Synchronized
  fun agentId(context: Context): String? =
    preferences(context).getString(AGENT_ID, null)?.let {
      runCatching { canonicalUuid(it) }.getOrNull()
    }

  @Synchronized
  fun pendingSubmission(
    context: Context,
    enrollment: AgentMobileEnrollment,
    payloadFactory: (String) -> String
  ): PendingDeviceStatusSubmission? {
    val preferences = preferences(context)
    if (!isCurrentEnrollment(preferences, enrollment)) return null
    loadPendingSubmission(preferences, enrollment.agentId)?.let { return it }

    val submissionId = UUID.randomUUID().toString()
    val payload = payloadFactory(submissionId)
    val parsedPayload = JSONObject(payload)
    require(
      parsedPayload.optString("submissionId") == submissionId &&
        parsedPayload.optString("agentId") == enrollment.agentId
    ) {
      "Device status submission identity is invalid"
    }
    persist(
      preferences.edit()
        .putString(PENDING_SUBMISSION_ID, submissionId)
        .putString(PENDING_SUBMISSION_AGENT_ID, enrollment.agentId)
        .putString(PENDING_SUBMISSION_PAYLOAD, payload),
      "Pending device status could not be saved"
    )
    return PendingDeviceStatusSubmission(submissionId, enrollment.agentId, payload)
  }

  @Synchronized
  fun completeSubmission(
    context: Context,
    enrollment: AgentMobileEnrollment,
    submissionId: String,
    acceptedAt: String,
    collectionIntervalSeconds: Long
  ): Boolean {
    require(collectionIntervalSeconds in 900L..3_600L) {
      "Mobile collection interval is invalid"
    }
    val canonicalAcceptedAt = Timestamps.canonical(acceptedAt)
    val preferences = preferences(context)
    if (!isCurrentEnrollment(preferences, enrollment) ||
      !isPendingSubmission(preferences, enrollment.agentId, submissionId)
    ) {
      return false
    }
    val editor = preferences.edit()
      .putLong(COLLECTION_INTERVAL_SECONDS, collectionIntervalSeconds)
      .putString(LAST_SUBMITTED_AT, canonicalAcceptedAt)
      .remove(LAST_ERROR)
    clearPendingSubmission(editor)
    persist(editor, "Device status success could not be saved")
    return true
  }

  @Synchronized
  fun discardSubmission(
    context: Context,
    enrollment: AgentMobileEnrollment,
    submissionId: String,
    error: String
  ): Boolean {
    val preferences = preferences(context)
    if (!isCurrentEnrollment(preferences, enrollment) ||
      !isPendingSubmission(preferences, enrollment.agentId, submissionId)
    ) {
      return false
    }
    val editor = preferences.edit().putString(LAST_ERROR, error.take(500))
    clearPendingSubmission(editor)
    persist(editor, "Device status rejection could not be saved")
    return true
  }

  @Synchronized
  fun recordError(context: Context, enrollment: AgentMobileEnrollment, error: String): Boolean {
    val preferences = preferences(context)
    if (!isCurrentEnrollment(preferences, enrollment)) return false
    persist(
      preferences.edit().putString(LAST_ERROR, error.take(500)),
      "Device status error could not be saved"
    )
    return true
  }

  @Synchronized
  fun invalidateEnrollment(
    context: Context,
    enrollment: AgentMobileEnrollment,
    error: String
  ): Boolean {
    if (!isCurrentEnrollment(preferences(context), enrollment)) return false
    invalidateEnrollmentState(context, error)
    return true
  }

  @Synchronized
  fun isCurrentEnrollment(context: Context, enrollment: AgentMobileEnrollment): Boolean =
    isCurrentEnrollment(preferences(context), enrollment)

  @Synchronized
  fun clearEnrollment(context: Context) {
    val editor = preferences(context).edit()
      .remove(SERVER_URL)
      .remove(ENROLLMENT_KEY)
      .remove(AGENT_ID)
      .remove(AGENT_NAME)
      .remove(COLLECTION_INTERVAL_SECONDS)
      .remove(ENROLLMENT_REVISION)
      .remove(LAST_SUBMITTED_AT)
      .remove(LAST_ERROR)
    clearPendingSubmission(editor)
    persist(editor, "Mobile agent enrollment could not be cleared")
  }

  fun lastSubmittedAt(context: Context): String? =
    preferences(context).getString(LAST_SUBMITTED_AT, null)

  fun lastError(context: Context): String? = preferences(context).getString(LAST_ERROR, null)

  private fun invalidateEnrollmentState(context: Context, error: String) {
    val preferences = preferences(context)
    val editor = preferences.edit()
      .remove(SERVER_URL)
      .remove(ENROLLMENT_KEY)
      .remove(AGENT_NAME)
      .remove(COLLECTION_INTERVAL_SECONDS)
      .remove(ENROLLMENT_REVISION)
      .putString(LAST_ERROR, error.take(500))
    if (agentId(context) == null) {
      editor.remove(AGENT_ID)
      clearPendingSubmission(editor)
    }
    persist(editor, "Mobile agent recovery state could not be saved")
  }

  private fun loadPendingSubmission(
    preferences: SharedPreferences,
    agentId: String
  ): PendingDeviceStatusSubmission? = runCatching {
    val submissionId = canonicalUuid(preferences.getString(PENDING_SUBMISSION_ID, null))
    val pendingAgentId = canonicalUuid(
      preferences.getString(PENDING_SUBMISSION_AGENT_ID, null)
    )
    require(pendingAgentId == agentId)
    val payload = requireNotNull(preferences.getString(PENDING_SUBMISSION_PAYLOAD, null))
    val parsedPayload = JSONObject(payload)
    require(parsedPayload.optString("submissionId") == submissionId)
    require(parsedPayload.optString("agentId") == agentId)
    PendingDeviceStatusSubmission(submissionId, pendingAgentId, payload)
  }.getOrNull()

  private fun isCurrentEnrollment(
    preferences: SharedPreferences,
    enrollment: AgentMobileEnrollment
  ): Boolean = preferences.getString(ENROLLMENT_REVISION, null) == enrollment.revision &&
    preferences.getString(AGENT_ID, null) == enrollment.agentId

  private fun isPendingSubmission(
    preferences: SharedPreferences,
    agentId: String,
    submissionId: String
  ): Boolean = preferences.getString(PENDING_SUBMISSION_AGENT_ID, null) == agentId &&
    preferences.getString(PENDING_SUBMISSION_ID, null) == submissionId

  private fun clearPendingSubmission(editor: SharedPreferences.Editor): SharedPreferences.Editor =
    editor
      .remove(PENDING_SUBMISSION_ID)
      .remove(PENDING_SUBMISSION_AGENT_ID)
      .remove(PENDING_SUBMISSION_PAYLOAD)

  private fun persist(editor: SharedPreferences.Editor, error: String) {
    check(editor.commit()) { error }
  }

  private fun canonicalUuid(value: String?): String =
    UUID.fromString(requireNotNull(value)).toString()

  private fun preferences(context: Context) =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  private fun encrypt(value: String): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, secretKey())
    val initializationVector = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
    val ciphertext = Base64.encodeToString(
      cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8)),
      Base64.NO_WRAP
    )
    return "$initializationVector:$ciphertext"
  }

  private fun decrypt(value: String): String {
    val parts = value.split(':', limit = 2)
    require(parts.size == 2) { "Encrypted mobile credential is invalid" }
    val initializationVector = Base64.decode(parts[0], Base64.NO_WRAP)
    val ciphertext = Base64.decode(parts[1], Base64.NO_WRAP)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, initializationVector))
    return String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8)
  }

  private fun secretKey(): SecretKey {
    val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
    val existing = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
    if (existing != null) return existing
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
    generator.init(
      KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .build()
    )
    return generator.generateKey()
  }
}

object Timestamps {
  private const val FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"

  fun now(): String = formatter().format(Date())

  fun canonical(value: String): String {
    val formatter = formatter()
    val parsed = try {
      requireNotNull(formatter.parse(value))
    } catch (error: Exception) {
      throw IllegalArgumentException("Timestamp is invalid", error)
    }
    return formatter.format(parsed).also { require(it == value) { "Timestamp is invalid" } }
  }

  private fun formatter() = SimpleDateFormat(FORMAT, Locale.US).apply {
    isLenient = false
    timeZone = TimeZone.getTimeZone("UTC")
  }
}
