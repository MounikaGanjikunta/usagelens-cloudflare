import type { BillingCase } from "./types";

export const billingCases: BillingCase[] = [
  {
    id: "case-acme-duplicate",
    customer: { id: "cus_acme", name: "Acme Corp" },
    period: {
      start: "2026-09-01T00:00:00.000Z",
      end: "2026-10-01T00:00:00.000Z"
    },
    invoiceFinalizedAt: "2026-10-02T00:00:00.000Z",
    billedUsage: 500,
    events: [
      {
        recordId: "rec_acme_001",
        idempotencyKey: "evt_acme_001",
        customerId: "cus_acme",
        metric: "api_requests",
        quantity: 100,
        occurredAt: "2026-09-08T14:00:00.000Z",
        receivedAt: "2026-09-08T14:00:01.000Z"
      },
      {
        recordId: "rec_acme_002",
        idempotencyKey: "evt_acme_002",
        customerId: "cus_acme",
        metric: "api_requests",
        quantity: 200,
        occurredAt: "2026-09-18T09:30:00.000Z",
        receivedAt: "2026-09-18T09:30:01.000Z"
      },
      {
        recordId: "rec_acme_003",
        idempotencyKey: "evt_acme_002",
        customerId: "cus_acme",
        metric: "api_requests",
        quantity: 200,
        occurredAt: "2026-09-18T09:30:00.000Z",
        receivedAt: "2026-09-18T09:31:10.000Z"
      }
    ]
  },
  {
    id: "case-northstar-late",
    customer: { id: "cus_northstar", name: "Northstar Labs" },
    period: {
      start: "2026-09-01T00:00:00.000Z",
      end: "2026-10-01T00:00:00.000Z"
    },
    invoiceFinalizedAt: "2026-10-02T00:00:00.000Z",
    billedUsage: 125,
    events: [
      {
        recordId: "rec_northstar_001",
        idempotencyKey: "evt_northstar_001",
        customerId: "cus_northstar",
        metric: "api_requests",
        quantity: 125,
        occurredAt: "2026-09-12T10:00:00.000Z",
        receivedAt: "2026-09-12T10:00:01.000Z"
      },
      {
        recordId: "rec_northstar_002",
        idempotencyKey: "evt_northstar_002",
        customerId: "cus_northstar",
        metric: "api_requests",
        quantity: 75,
        occurredAt: "2026-09-30T23:55:00.000Z",
        receivedAt: "2026-10-03T08:00:00.000Z"
      }
    ]
  },
  {
    id: "case-orbit-healthy",
    customer: { id: "cus_orbit", name: "Orbit Systems" },
    period: {
      start: "2026-09-01T00:00:00.000Z",
      end: "2026-10-01T00:00:00.000Z"
    },
    invoiceFinalizedAt: "2026-10-02T00:00:00.000Z",
    billedUsage: 420,
    events: [
      {
        recordId: "rec_orbit_001",
        idempotencyKey: "evt_orbit_001",
        customerId: "cus_orbit",
        metric: "api_requests",
        quantity: 170,
        occurredAt: "2026-09-10T12:00:00.000Z",
        receivedAt: "2026-09-10T12:00:01.000Z"
      },
      {
        recordId: "rec_orbit_002",
        idempotencyKey: "evt_orbit_002",
        customerId: "cus_orbit",
        metric: "api_requests",
        quantity: 250,
        occurredAt: "2026-09-22T16:00:00.000Z",
        receivedAt: "2026-09-22T16:00:01.000Z"
      }
    ]
  }
];

export function getBillingCase(caseId: string): BillingCase | undefined {
  return billingCases.find((billingCase) => billingCase.id === caseId);
}
