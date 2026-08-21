package app.mimorii.push

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MimoriiFirebaseMessagingServiceTest {
  private lateinit var context: Context
  private lateinit var service: MimoriiFirebaseMessagingService

  @Before
  fun setUp() {
    context = ApplicationProvider.getApplicationContext()
    context.getSharedPreferences("mimorii_push", Context.MODE_PRIVATE).edit().clear().commit()
    service = Robolectric.buildService(MimoriiFirebaseMessagingService::class.java).create().get()
  }

  @Test
  fun storesNewFirebaseRegistration() {
    service.onRegistered("fid-refreshed")

    assertEquals("fid-refreshed", PushStorage.installationId(service))
  }

  @Test
  fun removesMatchingFirebaseRegistration() {
    PushStorage.saveInstallationId(service, "fid-current")
    PushStorage.setEnabled(service, true)

    service.onUnregistered("fid-current")

    assertNull(PushStorage.installationId(service))
    assertFalse(PushStorage.enabled(service))
  }
}
