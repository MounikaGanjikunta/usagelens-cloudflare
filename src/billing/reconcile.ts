import type {
  BillingCase,
  ReconciliationFinding,
  ReconciliationResult,
  UsageEvent
} from "./types";

function sumQuantity(events: UsageEvent[]): number {
  return events.reduce((total, event) => total + event.quantity, 0);
}

function uniqueEventsByIdempotencyKey(events: UsageEvent[]): UsageEvent[] {
  const uniqueEvents = new Map<string, UsageEvent>();

  for (const event of events) {
    const existing = uniqueEvents.get(event.idempotencyKey);
    if (!existing || event.receivedAt < existing.receivedAt) {
      uniqueEvents.set(event.idempotencyKey, event);
    }
  }

  return [...uniqueEvents.values()];
}

/**
 * Reconcile billed usage using deterministic rules.
 *
 * 1. The earliest record for an idempotency key is the canonical event.
 * 2. A canonical event received after invoice finalization is late and is not
 *    eligible for this invoice.
 * 3. Billed usage must equal the sum of eligible canonical events.
 */
export function reconcileBillingCase(
  billingCase: BillingCase
): ReconciliationResult {
  const findings: ReconciliationFinding[] = [];
  const eventsByKey = new Map<string, UsageEvent[]>();

  for (const event of billingCase.events) {
    const matchingEvents = eventsByKey.get(event.idempotencyKey) ?? [];
    matchingEvents.push(event);
    eventsByKey.set(event.idempotencyKey, matchingEvents);
  }

  for (const [idempotencyKey, matchingEvents] of eventsByKey) {
    if (matchingEvents.length <= 1) continue;

    const sorted = [...matchingEvents].sort((left, right) =>
      left.receivedAt.localeCompare(right.receivedAt)
    );
    const duplicateEvents = sorted.slice(1);

    findings.push({
      code: "DUPLICATE_EVENT",
      severity: "critical",
      title: `Duplicate delivery for ${idempotencyKey}`,
      explanation:
        "Multiple stored records share one idempotency key. Only the earliest delivery should contribute to billed usage.",
      affectedRecordIds: sorted.map((event) => event.recordId),
      usageImpact: sumQuantity(duplicateEvents)
    });
  }

  const canonicalEvents = uniqueEventsByIdempotencyKey(billingCase.events);
  const lateEvents = canonicalEvents.filter(
    (event) => event.receivedAt > billingCase.invoiceFinalizedAt
  );
  const eligibleEvents = canonicalEvents.filter(
    (event) => event.receivedAt <= billingCase.invoiceFinalizedAt
  );

  for (const event of lateEvents) {
    findings.push({
      code: "LATE_EVENT",
      severity: "warning",
      title: `Late usage event ${event.idempotencyKey}`,
      explanation:
        "The event occurred during the billing period but arrived after invoice finalization, so it needs a later adjustment policy.",
      affectedRecordIds: [event.recordId],
      usageImpact: event.quantity
    });
  }

  const eligibleUsage = sumQuantity(eligibleEvents);
  const discrepancy = billingCase.billedUsage - eligibleUsage;

  if (discrepancy !== 0) {
    findings.push({
      code: "USAGE_MISMATCH",
      severity: "critical",
      title: "Billed usage does not match eligible usage",
      explanation:
        discrepancy > 0
          ? `The invoice contains ${discrepancy} more units than the eligible event total.`
          : `The invoice contains ${Math.abs(discrepancy)} fewer units than the eligible event total.`,
      affectedRecordIds: [],
      usageImpact: discrepancy
    });
  }

  return {
    caseId: billingCase.id,
    customerName: billingCase.customer.name,
    rawRecordedUsage: sumQuantity(billingCase.events),
    eligibleUsage,
    lateUsage: sumQuantity(lateEvents),
    billedUsage: billingCase.billedUsage,
    discrepancy,
    status: findings.length === 0 ? "matched" : "needs_review",
    findings
  };
}
