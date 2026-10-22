import { describe, expect, it } from "vitest";
import { getBillingCase } from "./fixtures";
import { reconcileBillingCase } from "./reconcile";

function requireCase(caseId: string) {
  const billingCase = getBillingCase(caseId);
  if (!billingCase) throw new Error(`Missing fixture: ${caseId}`);
  return billingCase;
}

describe("reconcileBillingCase", () => {
  it("detects duplicate deliveries without double-counting usage", () => {
    const result = reconcileBillingCase(requireCase("case-acme-duplicate"));

    expect(result.rawRecordedUsage).toBe(500);
    expect(result.eligibleUsage).toBe(300);
    expect(result.billedUsage).toBe(500);
    expect(result.discrepancy).toBe(200);
    expect(result.findings.map((finding) => finding.code)).toEqual([
      "DUPLICATE_EVENT",
      "USAGE_MISMATCH"
    ]);
  });

  it("flags late usage without treating it as an invoice mismatch", () => {
    const result = reconcileBillingCase(requireCase("case-northstar-late"));

    expect(result.rawRecordedUsage).toBe(200);
    expect(result.eligibleUsage).toBe(125);
    expect(result.lateUsage).toBe(75);
    expect(result.discrepancy).toBe(0);
    expect(result.findings.map((finding) => finding.code)).toEqual([
      "LATE_EVENT"
    ]);
  });

  it("returns a matched result for healthy usage", () => {
    const result = reconcileBillingCase(requireCase("case-orbit-healthy"));

    expect(result.status).toBe("matched");
    expect(result.eligibleUsage).toBe(420);
    expect(result.discrepancy).toBe(0);
    expect(result.findings).toEqual([]);
  });
});
