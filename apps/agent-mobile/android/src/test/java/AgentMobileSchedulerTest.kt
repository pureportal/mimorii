package app.mimorii.agentmobile

import android.content.Context
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.ListenableWorker
import androidx.work.NetworkType
import androidx.work.Worker
import androidx.work.WorkerFactory
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.testing.SynchronousExecutor
import androidx.work.testing.WorkManagerTestInitHelper
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AgentMobileSchedulerTest {
  @Test
  fun manualAndPeriodicCollectionsUseIndependentPersistentWork() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val workRuns = ConcurrentHashMap<UUID, AtomicInteger>()
    val periodicInputs = ConcurrentHashMap<UUID, Boolean>()
    WorkManagerTestInitHelper.initializeTestWorkManager(
      context,
      Configuration.Builder()
        .setExecutor(SynchronousExecutor())
        .setWorkerFactory(
          object : WorkerFactory() {
            override fun createWorker(
              appContext: Context,
              workerClassName: String,
              workerParameters: WorkerParameters
            ): ListenableWorker? =
              if (workerClassName == DeviceStatusWorker::class.java.name) {
                CountingWorker(appContext, workerParameters, workRuns, periodicInputs)
              } else {
                null
              }
          }
        )
        .build()
    )
    val workManager = WorkManager.getInstance(context)

    AgentMobileScheduler.collectNow(context)
    val manualCollection = workManager.activeImmediateWork()
    assertTrue(manualCollection.tags.contains(DeviceStatusWorker::class.java.name))
    assertEquals(NetworkType.CONNECTED, manualCollection.constraints.requiredNetworkType)

    AgentMobileScheduler.collectNow(context)
    val repeatedManualCollection = workManager.activeImmediateWork()
    assertTrue(repeatedManualCollection.id != manualCollection.id)

    val testDriver = requireNotNull(WorkManagerTestInitHelper.getTestDriver(context))
    testDriver.setAllConstraintsMet(repeatedManualCollection.id)
    shadowOf(Looper.getMainLooper()).idle()
    assertEquals(1, workRuns[repeatedManualCollection.id]?.get())
    assertEquals(false, periodicInputs[repeatedManualCollection.id])

    AgentMobileScheduler.ensurePeriodic(context, TimeUnit.MINUTES.toSeconds(15))
    val periodicWork = workManager.periodicWork().single()
    assertTrue(periodicWork.tags.contains(DeviceStatusWorker::class.java.name))
    assertEquals(NetworkType.CONNECTED, periodicWork.constraints.requiredNetworkType)

    AgentMobileScheduler.ensurePeriodic(context, TimeUnit.MINUTES.toSeconds(15))
    val updatedPeriodicWork = workManager.periodicWork().single()
    assertEquals(periodicWork.id, updatedPeriodicWork.id)
    assertEquals(repeatedManualCollection.id, workManager.activeImmediateWork().id)

    testDriver.setInitialDelayMet(updatedPeriodicWork.id)
    testDriver.setAllConstraintsMet(updatedPeriodicWork.id)
    shadowOf(Looper.getMainLooper()).idle()
    assertEquals(1, workRuns[updatedPeriodicWork.id]?.get())
    assertEquals(true, periodicInputs[updatedPeriodicWork.id])
    testDriver.setPeriodDelayMet(updatedPeriodicWork.id)
    testDriver.setAllConstraintsMet(updatedPeriodicWork.id)
    shadowOf(Looper.getMainLooper()).idle()
    assertEquals(2, workRuns[updatedPeriodicWork.id]?.get())

    AgentMobileScheduler.cancel(context)
    assertTrue(workManager.immediateWork().all { it.state.isFinished })
    assertTrue(workManager.periodicWork().all { it.state == WorkInfo.State.CANCELLED })
  }

  private fun WorkManager.immediateWork(): List<WorkInfo> =
    getWorkInfosForUniqueWork(AgentMobileScheduler.IMMEDIATE_WORK).get()

  private fun WorkManager.activeImmediateWork(): WorkInfo =
    immediateWork().single { it.state != WorkInfo.State.CANCELLED }

  private fun WorkManager.periodicWork(): List<WorkInfo> =
    getWorkInfosForUniqueWork(AgentMobileScheduler.PERIODIC_WORK).get()

  private class CountingWorker(
    context: Context,
    parameters: WorkerParameters,
    private val runs: ConcurrentHashMap<UUID, AtomicInteger>,
    private val periodicInputs: ConcurrentHashMap<UUID, Boolean>
  ) : Worker(context, parameters) {
    override fun doWork(): Result {
      runs.computeIfAbsent(id) { AtomicInteger() }.incrementAndGet()
      periodicInputs[id] = inputData.getBoolean(AgentMobileScheduler.PERIODIC_INPUT, false)
      return Result.success()
    }
  }
}
