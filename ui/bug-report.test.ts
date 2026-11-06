import { describe, expect, it } from "vitest";
import { bugReportUrl, osName } from "./bug-report";

const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) bb/0.48.1 Chrome/138.0 Electron/37.0 Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36";

describe("bug report link", () => {
  it("opens the bug-report form prefilled with the plugin version and OS", () => {
    expect(bugReportUrl("1.1.1", "Windows")).toBe(
      "https://github.com/AlsoKnownAs-Ax/bb-plugin-pr-xray/issues/new?template=bug_report.yml&version=1.1.1&os=Windows",
    );
  });

  it("names the OS from the user agent, and says Unknown when it can't tell", () => {
    expect(osName(WINDOWS)).toBe("Windows");
    expect(osName(MAC)).toBe("macOS");
    expect(osName(LINUX)).toBe("Linux");
    expect(osName("SomethingElse/1.0")).toBe("Unknown");
  });

  it("carries only the template, version and OS, so the PR ref never leaks to the public tracker", () => {
    const params = new URL(bugReportUrl("1.1.1", osName(MAC))).searchParams;
    expect([...params.keys()]).toEqual(["template", "version", "os"]);
  });
});
