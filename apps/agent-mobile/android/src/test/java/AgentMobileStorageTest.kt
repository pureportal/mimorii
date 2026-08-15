package app.mimorii.agentmobile

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import java.util.UUID
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AgentMobileStorageTest {
  private lateinit var context: Context

  @Before
  fun setUp() {
    context = ApplicationProvider.getApplicationContext()
    preferences().edit().clear().commit()
  }

  @After
  fun tearDown() {
    preferences().edit().clear().commit()
  }

  @Test
  fun pendingSubmissionSurvivesRetriesAndStaleWorkersCannotChangeCurrentState() {
    val collectorId = UUID.randomUUID().toString()
    val currentEnrollment = enrollment(collectorId, UUID.randomUUID().toString())
    val staleEnrollment = enrollment(collectorId, UUID.randomUUID().toString())
    preferences().edit()
      .putString("collector_id", collectorId)
      .putString("enrollment_revision", currentEnrollment.revision)
      .commit()
    var payloadsCreated = 0
    val payloadFactory = { submissionId: String ->
      payloadsCreated += 1
      JSONObject()
        .put("collectorId", collectorId)
        .put("submissionId", submissionId)
        .put("value", payloadsCreated)
        .toString()
    }

    val first = requireNotNull(
      AgentMobileStorage.pendingSubmission(context, currentEnrollment, payloadFactory)
    )
    val retry = requireNotNull(
      AgentMobileStorage.pendingSubmission(context, currentEnrollment, payloadFactory)
    )

    assertEquals(first, retry)
    assertEquals(1, payloadsCreated)
    assertFalse(
      AgentMobileStorage.completeSubmission(
        context,
        staleEnrollment,
        first.id,
        "2026-08-15T10:00:00.000Z",
        900
      )
    )
    assertFalse(
      AgentMobileStorage.invalidateEnrollment(context, staleEnrollment, "Stale key rejected")
    )
    assertEquals(currentEnrollment.revision, preferences().getString("enrollment_revision", null))

    assertTrue(
      AgentMobileStorage.invalidateEnrollment(context, currentEnrollment, "Collector key was rejected")
    )
    assertNull(preferences().getString("enrollment_revision", null))
    assertEquals(collectorId, AgentMobileStorage.collectorId(context))
    val reconnectedEnrollment = enrollment(collectorId, UUID.randomUUID().toString())
    preferences().edit()
      .putString("enrollment_revision", reconnectedEnrollment.revision)
      .commit()
    assertEquals(
      first,
      AgentMobileStorage.pendingSubmission(context, reconnectedEnrollment, payloadFactory)
    )
    assertEquals(1, payloadsCreated)
  }

  @Test
  fun completingSubmissionAtomicallyClearsPendingPayloadAndError() {
    val collectorId = UUID.randomUUID().toString()
    val enrollment = enrollment(collectorId, UUID.randomUUID().toString())
    preferences().edit()
      .putString("collector_id", collectorId)
      .putString("enrollment_revision", enrollment.revision)
      .putString("last_error", "Network unavailable")
      .commit()
    var payloadsCreated = 0
    val payloadFactory = { submissionId: String ->
      payloadsCreated += 1
      JSONObject()
        .put("collectorId", collectorId)
        .put("submissionId", submissionId)
        .toString()
    }
    val pending = requireNotNull(
      AgentMobileStorage.pendingSubmission(context, enrollment, payloadFactory)
    )

    assertTrue(
      AgentMobileStorage.completeSubmission(
        context,
        enrollment,
        pending.id,
        "2026-08-15T10:00:00.000Z",
        1_800
      )
    )

    assertNull(AgentMobileStorage.lastError(context))
    assertEquals("2026-08-15T10:00:00.000Z", AgentMobileStorage.lastSubmittedAt(context))
    assertEquals(1_800, preferences().getLong("collection_interval_seconds", 0))
    val next = requireNotNull(
      AgentMobileStorage.pendingSubmission(context, enrollment, payloadFactory)
    )
    assertTrue(next.id != pending.id)
    assertEquals(2, payloadsCreated)
  }

  @Test
  fun staleEnrollmentCannotCreateOrReplacePendingState() {
    val collectorId = UUID.randomUUID().toString()
    val currentEnrollment = enrollment(collectorId, UUID.randomUUID().toString())
    val staleEnrollment = enrollment(collectorId, UUID.randomUUID().toString())
    preferences().edit()
      .putString("collector_id", collectorId)
      .putString("enrollment_revision", currentEnrollment.revision)
      .commit()
    var payloadsCreated = 0
    val payloadFactory = { submissionId: String ->
      payloadsCreated += 1
      JSONObject()
        .put("collectorId", collectorId)
        .put("submissionId", submissionId)
        .toString()
    }

    assertNull(AgentMobileStorage.pendingSubmission(context, staleEnrollment, payloadFactory))
    val current = AgentMobileStorage.pendingSubmission(
      context,
      currentEnrollment,
      payloadFactory
    )

    assertTrue(current != null)
    assertEquals(1, payloadsCreated)
  }

  @Test
  fun invalidPendingIdentityIsReplacedBeforeSubmission() {
    val collectorId = UUID.randomUUID().toString()
    val enrollment = enrollment(collectorId, UUID.randomUUID().toString())
    val staleSubmissionId = UUID.randomUUID().toString()
    preferences().edit()
      .putString("collector_id", collectorId)
      .putString("enrollment_revision", enrollment.revision)
      .putString("pending_submission_id", staleSubmissionId)
      .putString("pending_submission_collector_id", collectorId)
      .putString(
        "pending_submission_payload",
        JSONObject().put("submissionId", staleSubmissionId).toString()
      )
      .commit()
    var payloadsCreated = 0

    val pending = requireNotNull(
      AgentMobileStorage.pendingSubmission(context, enrollment) { submissionId ->
        payloadsCreated += 1
        JSONObject()
          .put("collectorId", collectorId)
          .put("submissionId", submissionId)
          .toString()
      }
    )

    assertTrue(pending.id != staleSubmissionId)
    assertEquals(1, payloadsCreated)
  }

  @Test
  fun timestampsRejectNonCanonicalServerValues() {
    assertEquals(
      "2026-08-15T10:00:00.000Z",
      Timestamps.canonical("2026-08-15T10:00:00.000Z")
    )
    assertThrows(IllegalArgumentException::class.java) {
      Timestamps.canonical("2026-08-15T10:00:00Z")
    }
  }

  private fun enrollment(collectorId: String, revision: String) = AgentMobileEnrollment(
    serverUrl = "https://monitor.example/api",
    enrollmentKey = "mim_agent_test_key_that_is_long_enough_for_enrollment",
    collectorId = collectorId,
    collectionIntervalSeconds = 900,
    revision = revision
  )

  private fun preferences() =
    context.getSharedPreferences("mimorii_agent_mobile", Context.MODE_PRIVATE)
}
