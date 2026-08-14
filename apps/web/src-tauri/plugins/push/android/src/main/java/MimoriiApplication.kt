package app.mimorii.push

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

class MimoriiApplication : Application() {
  override fun onCreate() {
    super.onCreate()
    if (firebaseConfigured() && FirebaseApp.getApps(this).none { it.name == FirebaseApp.DEFAULT_APP_NAME }) {
      FirebaseApp.initializeApp(
        this,
        FirebaseOptions.Builder()
          .setApiKey(BuildConfig.MIMORII_FIREBASE_API_KEY)
          .setApplicationId(BuildConfig.MIMORII_FIREBASE_APPLICATION_ID)
          .setProjectId(BuildConfig.MIMORII_FIREBASE_PROJECT_ID)
          .setGcmSenderId(BuildConfig.MIMORII_FIREBASE_SENDER_ID)
          .build()
      )
    }
    NotificationChannels.create(this)
  }

  companion object {
    fun firebaseConfigured(): Boolean = listOf(
      BuildConfig.MIMORII_FIREBASE_API_KEY,
      BuildConfig.MIMORII_FIREBASE_APPLICATION_ID,
      BuildConfig.MIMORII_FIREBASE_PROJECT_ID,
      BuildConfig.MIMORII_FIREBASE_SENDER_ID
    ).all { it.isNotBlank() }
  }
}
