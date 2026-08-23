package app.mimorii.agentmobile

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

object AgentMobileScheduler {
  internal const val PERIODIC_WORK = "mimorii-agent-mobile-periodic"
  internal const val IMMEDIATE_WORK = "mimorii-agent-mobile-collection"
  internal const val PERIODIC_INPUT = "mimorii-agent-mobile-periodic-input"

  fun ensurePeriodic(context: Context, intervalSeconds: Long) {
    require(intervalSeconds in 900L..3_600L) { "Mobile collection interval is invalid" }
    val request = PeriodicWorkRequestBuilder<DeviceStatusWorker>(
      intervalSeconds,
      TimeUnit.SECONDS
    )
      .setInitialDelay(intervalSeconds, TimeUnit.SECONDS)
      .setConstraints(
        Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
      )
      .setInputData(workDataOf(PERIODIC_INPUT to true))
      .build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
      PERIODIC_WORK,
      ExistingPeriodicWorkPolicy.UPDATE,
      request
    )
  }

  fun collectNow(context: Context) {
    val request = OneTimeWorkRequestBuilder<DeviceStatusWorker>()
      .setConstraints(
        Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
      )
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(
      IMMEDIATE_WORK,
      ExistingWorkPolicy.REPLACE,
      request
    )
  }

  fun cancel(context: Context) {
    val workManager = WorkManager.getInstance(context)
    workManager.cancelUniqueWork(PERIODIC_WORK)
    workManager.cancelUniqueWork(IMMEDIATE_WORK)
  }
}
