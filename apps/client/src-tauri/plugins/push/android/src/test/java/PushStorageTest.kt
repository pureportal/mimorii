package app.mimorii.push

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PushStorageTest {
  private lateinit var context: Context

  @Before
  fun setUp() {
    context = ApplicationProvider.getApplicationContext()
    context.getSharedPreferences("mimorii_push", Context.MODE_PRIVATE).edit().clear().commit()
  }

  @Test
  fun deviceKeyIsStable() {
    assertEquals(PushStorage.deviceKey(context), PushStorage.deviceKey(context))
  }

  @Test
  fun clearingRegistrationAlsoDisablesDelivery() {
    PushStorage.saveInstallationId(context, "fid-1")
    PushStorage.setEnabled(context, true)

    PushStorage.clearInstallationId(context)

    assertNull(PushStorage.installationId(context))
    assertFalse(PushStorage.enabled(context))
  }
}
