package app.mimorii.agentmobile

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object AgentMobileScheduler {
  internal const val PERIODIC_WORK = "mimorii-agent-mobile-periodic"
  internal const val COLLECTION_WORK = "mimorii-agent-mobile-collection"

  fun ensurePeriodic(context: Context, intervalSeconds: Long) {
    require(intervalSeconds in 900L..3_600L) { "Mobile collection interval is invalid" }
    val constraints = Constraints.Builder()
      .setRequiredNetworkType(NetworkType.CONNECTED)
      .build()
    val request = PeriodicWorkRequestBuilder<DeviceStatusScheduleWorker>(
      intervalSeconds,
      TimeUnit.SECONDS
    )
      .setInitialDelay(intervalSeconds, TimeUnit.SECONDS)
      .setConstraints(constraints)
      .build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
      PERIODIC_WORK,
      ExistingPeriodicWorkPolicy.UPDATE,
      request
    )
  }

  fun collectNow(context: Context) {
    enqueueCollection(context, ExistingWorkPolicy.REPLACE)
  }

  fun scheduleCollection(context: Context) {
    enqueueCollection(context, ExistingWorkPolicy.KEEP)
  }

  private fun enqueueCollection(context: Context, policy: ExistingWorkPolicy) {
    val request = OneTimeWorkRequestBuilder<DeviceStatusWorker>()
      .setConstraints(
        Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
      )
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(
      COLLECTION_WORK,
      policy,
      request
    )
  }

  fun cancel(context: Context) {
    val workManager = WorkManager.getInstance(context)
    workManager.cancelUniqueWork(PERIODIC_WORK)
    workManager.cancelUniqueWork(COLLECTION_WORK)
  }
}
