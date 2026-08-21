package app.mimorii.agentmobile

import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.SynchronousExecutor
import androidx.work.testing.WorkManagerTestInitHelper
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AgentMobileLifecycleTest {
  private lateinit var context: Context

  @Before
  fun setUp() {
    context = ApplicationProvider.getApplicationContext()
    context.getSharedPreferences("mimorii_agent_mobile", Context.MODE_PRIVATE)
      .edit()
      .clear()
      .commit()
    WorkManagerTestInitHelper.initializeTestWorkManager(
      context,
      Configuration.Builder().setExecutor(SynchronousExecutor()).build()
    )
  }

  @Test
  fun bootReconciliationRemovesWorkWhenNotEnrolled() {
    AgentMobileScheduler.ensurePeriodic(context, 900)

    AgentBootReceiver().onReceive(context, Intent(Intent.ACTION_BOOT_COMPLETED))

    val work = WorkManager.getInstance(context)
      .getWorkInfosForUniqueWork(AgentMobileScheduler.PERIODIC_WORK)
      .get()
    assertTrue(work.all { it.state == WorkInfo.State.CANCELLED })
  }
}
