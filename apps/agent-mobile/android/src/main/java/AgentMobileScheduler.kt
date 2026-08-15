package app.mimorii.agentmobile

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object AgentMobileScheduler {
  private const val PERIODIC_WORK = "mimorii-agent-mobile-periodic"
  private const val IMMEDIATE_WORK = "mimorii-agent-mobile-immediate"

  fun ensurePeriodic(context: Context, intervalSeconds: Long) {
    require(intervalSeconds in 900L..3_600L) { "Mobile collection interval is invalid" }
    val constraints = Constraints.Builder()
      .setRequiredNetworkType(NetworkType.CONNECTED)
      .build()
    val request = PeriodicWorkRequestBuilder<DeviceStatusWorker>(
      intervalSeconds,
      TimeUnit.SECONDS
    )
      .setInitialDelay(intervalSeconds, TimeUnit.SECONDS)
      .setConstraints(constraints)
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
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
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
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
