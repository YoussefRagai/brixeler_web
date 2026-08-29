export type GrowthEligibilityRow = { status?: string | null };
export type GrowthClaimRow = { status?: string | null };

// A claimed eligibility was eligible before it was consumed, so it remains
// part of the eligible population used for the funnel denominator.
const ELIGIBLE_STATUSES = new Set(["eligible", "claimed"]);
const CLAIMED_STATUSES = new Set(["pending", "approved", "fulfilled"]);
const APPROVED_STATUSES = new Set(["approved", "fulfilled"]);

export function summarizeGiftGrowthMetrics(
  eligibilityRows: GrowthEligibilityRow[],
  claimRows: GrowthClaimRow[],
) {
  const eligibleCount = eligibilityRows.filter((row) => ELIGIBLE_STATUSES.has(row.status ?? "")).length;
  const claimedCount = claimRows.filter((row) => CLAIMED_STATUSES.has(row.status ?? "")).length;
  const approvedCount = claimRows.filter((row) => APPROVED_STATUSES.has(row.status ?? "")).length;
  const fulfilledCount = claimRows.filter((row) => row.status === "fulfilled").length;

  return {
    eligibleCount,
    claimedCount,
    approvedCount,
    fulfilledCount,
    claimRate: eligibleCount ? Math.round((claimedCount / eligibleCount) * 100) : 0,
    fulfillmentRate: claimedCount ? Math.round((fulfilledCount / claimedCount) * 100) : 0,
  };
}
