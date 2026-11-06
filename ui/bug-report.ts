// Link to a prefilled GitHub bug report. Never pass the PR ref: the tracker is public, reviewed PRs often aren't.
import { BUG_REPORT_TEMPLATE, REPO_URL } from "../shared/settings";

export type OsName = "Windows" | "macOS" | "Linux" | "Unknown";

const OS_MARKERS = [
  { marker: "Windows", os: "Windows" },
  { marker: "Mac OS X", os: "macOS" },
  { marker: "Linux", os: "Linux" },
] satisfies { marker: string; os: OsName }[];

export function osName(userAgent: string): OsName {
  return OS_MARKERS.find(({ marker }) => userAgent.includes(marker))?.os ?? "Unknown";
}

export function bugReportUrl(version: string, os: OsName): string {
  const params = new URLSearchParams({ template: BUG_REPORT_TEMPLATE, version, os });
  return `${REPO_URL}/issues/new?${params}`;
}
