export type FindingCode = "DUPLICATE_EVENT" | "LATE_EVENT" | "USAGE_MISMATCH";

export type FindingSeverity = "info" | "warning" | "critical";

export interface Customer {
  id: string;
  name: string;
}

/**
 * One record received by the metering pipeline.
 *
 * recordId identifies this stored row. idempotencyKey identifies the business
 * event. Two rows with different recordIds but the same idempotencyKey are a
 * duplicate delivery of one event.
 */
export interface UsageEvent {
  recordId: string;
  idempotencyKey: string;
  customerId: string;
  metric: "api_requests";
  quantity: number;
  occurredAt: string;
  receivedAt: string;
}

export interface BillingCase {
  id: string;
  customer: Customer;
  period: {
    start: string;
    end: string;
  };
  invoiceFinalizedAt: string;
  billedUsage: number;
  events: UsageEvent[];
}

export interface ReconciliationFinding {
  code: FindingCode;
  severity: FindingSeverity;
  title: string;
  explanation: string;
  affectedRecordIds: string[];
  usageImpact: number;
}

export interface ReconciliationResult {
  caseId: string;
  customerName: string;
  rawRecordedUsage: number;
  eligibleUsage: number;
  lateUsage: number;
  billedUsage: number;
  discrepancy: number;
  status: "matched" | "needs_review";
  findings: ReconciliationFinding[];
}
