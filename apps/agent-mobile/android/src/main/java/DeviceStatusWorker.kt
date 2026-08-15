package app.mimorii.agentmobile

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.IOException

class DeviceStatusWorker(
  context: Context,
  parameters: WorkerParameters
) : Worker(context, parameters) {
  override fun doWork(): Result {
    val enrollment = AgentMobileStorage.enrollment(applicationContext) ?: run {
      AgentMobileScheduler.cancel(applicationContext)
      return Result.success()
    }
    return try {
      val interval = DeviceStatusReporter.submit(applicationContext, enrollment)
      AgentMobileStorage.recordSuccess(applicationContext)
      if (interval != enrollment.collectionIntervalSeconds) {
        AgentMobileStorage.updateCollectionInterval(applicationContext, interval)
        AgentMobileScheduler.ensurePeriodic(applicationContext, interval)
      }
      Result.success()
    } catch (error: AgentAuthenticationException) {
      AgentMobileStorage.recordError(applicationContext, error.message ?: "Collector key was rejected")
      AgentMobileStorage.clearEnrollment(applicationContext)
      AgentMobileScheduler.cancel(applicationContext)
      Result.failure()
    } catch (error: PermanentSubmissionException) {
      AgentMobileStorage.recordError(applicationContext, error.message ?: "Device status was rejected")
      Result.failure()
    } catch (error: IOException) {
      AgentMobileStorage.recordError(applicationContext, error.message ?: "Device status could not be sent")
      Result.retry()
    } catch (error: Exception) {
      AgentMobileStorage.recordError(applicationContext, error.message ?: "Device status collection failed")
      Result.retry()
    }
  }
}
