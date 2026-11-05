import { afterEach, describe, expect, it, vi } from "vitest";
import { createGithub, splitHunks } from "./github";

afterEach(() => vi.unstubAllGlobals());

describe("hunk fingerprints", () => {
  const body = " ctx\n-check();\n ctx";
  const fingerprint = (header: string) => splitHunks(`${header}\n${body}`, 0, "x.ts")[0]!.fingerprint;

  it("keeps a viewed mark when a commit only shifts the hunk's lines", () => {
    expect(fingerprint("@@ -10,3 +10,2 @@ function a() {")).toBe(fingerprint("@@ -90,3 +90,2 @@ function a() {"));
  });

  it("treats the same change in another function as a new hunk", () => {
    expect(fingerprint("@@ -10,3 +10,2 @@ function a() {")).not.toBe(fingerprint("@@ -10,3 +10,2 @@ function b() {"));
  });

  it("treats a second identical hunk in a file as a new hunk", () => {
    const patch = `@@ -10,3 +10,2 @@ function a() {\n${body}\n@@ -40,3 +39,2 @@ function a() {\n${body}`;
    const [first, second] = splitHunks(patch, 0, "x.ts");
    expect(first!.fingerprint).not.toBe(second!.fingerprint);
  });
});

describe("reading a review's comments", () => {
  it("reads every page, not only the first 100", async () => {
    const page = (size: number) => Array.from({ length: size }, (_, id) => ({ id }));
    const fetchPage = vi.fn(async (url: string) => {
      const body = url.endsWith("&page=1") ? page(100) : page(1);
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchPage);
    const github = createGithub(async () => "token");
    const comments = await github.reviewComments({ owner: "acme", repo: "web", number: 7 }, 42);
    expect(comments).toHaveLength(101);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
