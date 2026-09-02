import { buildReviewIssues } from "../../../src/domain/qc";
import type { ReviewIssueKind, TrialRecord } from "../../../src/domain/types";
import type { CatalogTrial } from "../catalog";
import { metadataString, trackingCorrectionCount } from "./trialSummary";

export type ReviewIssueRow = {
  type: ReviewIssueKind;
  startSeconds: number;
  endSeconds: number;
  message: string;
};

export type ReviewTrialRow = {
  analysisId: string;
  trialId: string;
  animalId: string | null;
  cohort: string | null;
  sourceFile: string;
  reviewStatus: TrialRecord["reviewStatus"];
  issueCount: number;
  manualCorrectionCount: number;
  issues: ReviewIssueRow[];
};

/**
 * Individual QC issues have no resolved flag. `unresolvedOnly` uses existing
 * reviewStatus semantics: needs-review trials, not reviewed/complete.
 */
export function isUnresolvedReview(status: TrialRecord["reviewStatus"]): boolean {
  return status === "needs-review";
}

export function buildReviewIssueRows(
  items: CatalogTrial[],
  options: { trialId?: string; unresolvedOnly?: boolean },
): ReviewTrialRow[] {
  return items
    .map((item) => {
      const issues = buildReviewIssues(item.trial).map((issue) => ({
        type: issue.kind,
        startSeconds: issue.startSeconds,
        endSeconds: issue.endSeconds,
        message: issue.summary,
      }));
      return {
        analysisId: item.analysisId,
        trialId: item.trial.id,
        animalId: metadataString(item.trial.experimentMetadata.animalId),
        cohort: metadataString(item.trial.experimentMetadata.cohort),
        sourceFile: item.trial.source.fileName,
        reviewStatus: item.trial.reviewStatus,
        issueCount: issues.length,
        manualCorrectionCount: trackingCorrectionCount(item.trial),
        issues,
      };
    })
    .filter((row) => {
      if (options.trialId && row.trialId !== options.trialId) return false;
      if (options.unresolvedOnly) return isUnresolvedReview(row.reviewStatus);
      if (options.trialId) return true;
      return row.issueCount > 0;
    });
}
