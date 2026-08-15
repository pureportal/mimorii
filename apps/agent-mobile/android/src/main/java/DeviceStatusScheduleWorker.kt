package app.mimorii.agentmobile

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

class DeviceStatusScheduleWorker(
  context: Context,
  parameters: WorkerParameters
) : Worker(context, parameters) {
  override fun doWork(): Result {
    val enrollment = AgentMobileStorage.enrollment(applicationContext)
    if (enrollment == null) {
      AgentMobileScheduler.cancel(applicationContext)
      return Result.success()
    }
    return try {
      AgentMobileScheduler.scheduleCollection(applicationContext)
      Result.success()
    } catch (error: Exception) {
      AgentMobileStorage.recordError(
        applicationContext,
        enrollment,
        error.message ?: "Background collection could not be scheduled"
      )
      Result.retry()
    }
  }
}
