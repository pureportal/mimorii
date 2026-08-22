package app.mimorii.agentmobile

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.IOException

class DeviceStatusWorker(
  context: Context,
  parameters: WorkerParameters
) : Worker(context, parameters) {
  @Volatile
  private var activeReporter: DeviceStatusReporter? = null

  override fun doWork(): Result {
    val enrollment = AgentMobileStorage.enrollment(applicationContext) ?: run {
      AgentMobileScheduler.cancel(applicationContext)
      return Result.success()
    }
    var pendingSubmission: PendingDeviceStatusSubmission? = null
    var reporter: DeviceStatusReporter? = null
    return try {
      pendingSubmission = AgentMobileStorage.pendingSubmission(
        applicationContext,
        enrollment
      ) { submissionId ->
        DeviceStatusCollector.collect(applicationContext)
          .toJson()
          .put("agentId", enrollment.agentId)
          .put("submissionId", submissionId)
          .toString()
      } ?: return Result.success()
      if (isStopped || !AgentMobileStorage.isCurrentEnrollment(applicationContext, enrollment)) {
        return Result.success()
      }
      reporter = DeviceStatusReporter(
        applicationContext,
        enrollment,
        pendingSubmission.payload
      )
      if (!activateReporter(reporter)) return Result.success()
      val response = reporter.submit()
      if (isStopped) return Result.success()
      if (!AgentMobileStorage.isCurrentEnrollment(applicationContext, enrollment)) {
        return Result.success()
      }
      try {
        AgentMobileScheduler.ensurePeriodic(
          applicationContext,
          response.collectionIntervalSeconds
        )
      } catch (error: Exception) {
        AgentMobileStorage.recordError(
          applicationContext,
          enrollment,
          error.message ?: "Background collection could not be scheduled"
        )
        return Result.retry()
      }
      val completed = AgentMobileStorage.completeSubmission(
        applicationContext,
        enrollment,
        pendingSubmission.id,
        response.acceptedAt,
        response.collectionIntervalSeconds
      )
      if (!completed || isStopped) return Result.success()
      Result.success()
    } catch (error: AgentAuthenticationException) {
      if (isStopped) return Result.success()
      val invalidated = AgentMobileStorage.invalidateEnrollment(
        applicationContext,
        enrollment,
        error.message ?: "Agent key was rejected"
      )
      if (invalidated) AgentMobileScheduler.cancel(applicationContext)
      Result.failure()
    } catch (error: PermanentSubmissionException) {
      if (isStopped) return Result.success()
      val message = error.message ?: "Device status was rejected"
      if (pendingSubmission == null) {
        AgentMobileStorage.recordError(applicationContext, enrollment, message)
      } else {
        AgentMobileStorage.discardSubmission(
          applicationContext,
          enrollment,
          pendingSubmission.id,
          message
        )
      }
      Result.failure()
    } catch (error: IOException) {
      if (isStopped || reporter?.isCancelled() == true) return Result.success()
      AgentMobileStorage.recordError(
        applicationContext,
        enrollment,
        error.message ?: "Device status could not be sent"
      )
      Result.retry()
    } catch (error: Exception) {
      if (isStopped) return Result.success()
      AgentMobileStorage.recordError(
        applicationContext,
        enrollment,
        error.message ?: "Device status collection failed"
      )
      Result.failure()
    } finally {
      deactivateReporter(reporter)
    }
  }

  @Synchronized
  private fun activateReporter(reporter: DeviceStatusReporter): Boolean {
    activeReporter = reporter
    if (!isStopped) return true
    reporter.cancel()
    activeReporter = null
    return false
  }

  @Synchronized
  private fun deactivateReporter(reporter: DeviceStatusReporter?) {
    if (activeReporter === reporter) activeReporter = null
  }

  @Synchronized
  override fun onStopped() {
    activeReporter?.cancel()
  }
}
