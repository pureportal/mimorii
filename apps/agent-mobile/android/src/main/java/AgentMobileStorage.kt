package app.mimorii.agentmobile

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class AgentMobileEnrollment(
  val serverUrl: String,
  val enrollmentKey: String,
  val collectorId: String,
  val collectionIntervalSeconds: Long
)

object AgentMobileStorage {
  private const val PREFERENCES = "mimorii_agent_mobile"
  private const val SERVER_URL = "server_url"
  private const val ENROLLMENT_KEY = "enrollment_key"
  private const val COLLECTOR_ID = "collector_id"
  private const val COLLECTION_INTERVAL_SECONDS = "collection_interval_seconds"
  private const val LAST_SUBMITTED_AT = "last_submitted_at"
  private const val LAST_ERROR = "last_error"
  private const val KEYSTORE = "AndroidKeyStore"
  private const val KEY_ALIAS = "mimorii_agent_mobile_key"

  fun saveEnrollment(context: Context, enrollment: AgentMobileEnrollment) {
    val saved = preferences(context).edit()
      .putString(SERVER_URL, enrollment.serverUrl)
      .putString(ENROLLMENT_KEY, encrypt(enrollment.enrollmentKey))
      .putString(COLLECTOR_ID, enrollment.collectorId)
      .putLong(COLLECTION_INTERVAL_SECONDS, enrollment.collectionIntervalSeconds)
      .remove(LAST_ERROR)
      .commit()
    check(saved) { "Mobile collector enrollment could not be saved" }
  }

  fun enrollment(context: Context): AgentMobileEnrollment? {
    val preferences = preferences(context)
    val serverUrl = preferences.getString(SERVER_URL, null) ?: return null
    val encryptedKey = preferences.getString(ENROLLMENT_KEY, null) ?: return null
    val collectorId = preferences.getString(COLLECTOR_ID, null) ?: return null
    val interval = preferences.getLong(COLLECTION_INTERVAL_SECONDS, 0)
    if (interval <= 0) return null
    return try {
      AgentMobileEnrollment(serverUrl, decrypt(encryptedKey), collectorId, interval)
    } catch (_: Exception) {
      clearEnrollment(context)
      null
    }
  }

  fun updateCollectionInterval(context: Context, seconds: Long) {
    val saved = preferences(context).edit()
      .putLong(COLLECTION_INTERVAL_SECONDS, seconds)
      .commit()
    check(saved) { "Mobile collector interval could not be saved" }
  }

  fun clearEnrollment(context: Context, clearError: Boolean = false) {
    val editor = preferences(context).edit()
      .remove(SERVER_URL)
      .remove(ENROLLMENT_KEY)
      .remove(COLLECTOR_ID)
      .remove(COLLECTION_INTERVAL_SECONDS)
    if (clearError) editor.remove(LAST_ERROR)
    editor.commit()
  }

  fun recordSuccess(context: Context) {
    preferences(context).edit()
      .putString(LAST_SUBMITTED_AT, Timestamps.now())
      .remove(LAST_ERROR)
      .apply()
  }

  fun recordError(context: Context, error: String) {
    preferences(context).edit().putString(LAST_ERROR, error.take(500)).apply()
  }

  fun lastSubmittedAt(context: Context): String? =
    preferences(context).getString(LAST_SUBMITTED_AT, null)

  fun lastError(context: Context): String? = preferences(context).getString(LAST_ERROR, null)

  private fun preferences(context: Context) =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  private fun encrypt(value: String): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, secretKey())
    val initializationVector = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
    val ciphertext = Base64.encodeToString(cipher.doFinal(value.toByteArray()), Base64.NO_WRAP)
    return "$initializationVector:$ciphertext"
  }

  private fun decrypt(value: String): String {
    val parts = value.split(':', limit = 2)
    require(parts.size == 2) { "Encrypted mobile credential is invalid" }
    val initializationVector = Base64.decode(parts[0], Base64.NO_WRAP)
    val ciphertext = Base64.decode(parts[1], Base64.NO_WRAP)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, initializationVector))
    return String(cipher.doFinal(ciphertext))
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
  fun now(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).run {
    timeZone = TimeZone.getTimeZone("UTC")
    format(Date())
  }
}
