// Link to a prefilled GitHub bug report. Never pass the PR ref: the tracker is public, reviewed PRs often aren't.
export type OsName = "Windows" | "macOS" | "Linux" | "Unknown";

const OS_MARKERS = [
  { marker: "Windows", os: "Windows" },
  { marker: "Mac OS X", os: "macOS" },
  { marker: "Linux", os: "Linux" },
] satisfies { marker: string; os: OsName }[];

export function osName(userAgent: string): OsName {
  return OS_MARKERS.find(({ marker }) => userAgent.includes(marker))?.os ?? "Unknown";
}

export const repoUrl = "https://github.com/AlsoKnownAs-Ax/bb-plugin-pr-xray";

export function bugReportUrl(version: string, os: OsName): string {
  const params = new URLSearchParams({ template: "bug_report.yml", version, os });
  return `${repoUrl}/issues/new?${params}`;
}
