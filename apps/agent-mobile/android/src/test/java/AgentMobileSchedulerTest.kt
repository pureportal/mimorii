package app.mimorii.agentmobile

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.SynchronousExecutor
import androidx.work.testing.WorkManagerTestInitHelper
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AgentMobileSchedulerTest {
  @Test
  fun manualRunsReplaceBackoffWhilePeriodicRunsKeepTheActiveCollection() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    WorkManagerTestInitHelper.initializeTestWorkManager(
      context,
      Configuration.Builder().setExecutor(SynchronousExecutor()).build()
    )
    val workManager = WorkManager.getInstance(context)

    AgentMobileScheduler.scheduleCollection(context)
    val firstCollection = workManager.collectionWork().single()
    AgentMobileScheduler.scheduleCollection(context)
    val repeatedCollection = workManager.collectionWork().single()

    assertEquals(firstCollection.id, repeatedCollection.id)
    assertTrue(firstCollection.tags.contains(DeviceStatusWorker::class.java.name))

    AgentMobileScheduler.collectNow(context)
    val manualCollection = workManager.activeCollection()
    assertTrue(manualCollection.id != repeatedCollection.id)

    AgentMobileScheduler.collectNow(context)
    val repeatedManualCollection = workManager.activeCollection()
    assertTrue(repeatedManualCollection.id != manualCollection.id)

    AgentMobileScheduler.ensurePeriodic(context, TimeUnit.MINUTES.toSeconds(15))
    val periodicWork = workManager.periodicWork().single()
    assertTrue(periodicWork.tags.contains(DeviceStatusScheduleWorker::class.java.name))

    AgentMobileScheduler.cancel(context)
    assertTrue(workManager.collectionWork().all { it.state == WorkInfo.State.CANCELLED })
    assertTrue(workManager.periodicWork().all { it.state == WorkInfo.State.CANCELLED })
  }

  private fun WorkManager.collectionWork(): List<WorkInfo> =
    getWorkInfosForUniqueWork(AgentMobileScheduler.COLLECTION_WORK).get()

  private fun WorkManager.activeCollection(): WorkInfo =
    collectionWork().single { it.state != WorkInfo.State.CANCELLED }

  private fun WorkManager.periodicWork(): List<WorkInfo> =
    getWorkInfosForUniqueWork(AgentMobileScheduler.PERIODIC_WORK).get()
}
