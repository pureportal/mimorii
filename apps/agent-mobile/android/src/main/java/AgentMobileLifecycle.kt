package app.mimorii.agentmobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

object AgentMobileLifecycle {
  fun reconcile(context: Context) {
    val enrollment = AgentMobileStorage.enrollment(context)
    if (enrollment == null) {
      AgentMobileScheduler.cancel(context)
      return
    }
    try {
      AgentMobileScheduler.ensurePeriodic(context, enrollment.collectionIntervalSeconds)
    } catch (error: Exception) {
      AgentMobileStorage.recordError(
        context,
        enrollment,
        error.message ?: "Background collection could not be scheduled"
      )
    }
  }
}

class AgentBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
      intent.action == Intent.ACTION_MY_PACKAGE_REPLACED
    ) {
      AgentMobileLifecycle.reconcile(context)
    }
  }
}
