import { describe, expect, it } from "vitest";
import { withoutRemoteContent } from "./remote-content";

const U = "https://evil.test/x.gif";

describe("withoutRemoteContent", () => {
  it.each([
    `![a](${U})`,
    `![a[b]c](<${U}>)`,
    `[![a](${U})](https://example.com)`,
    `![r][]\n\n[r]: ${U}`,
    `![r]\n\n[r]: ${U}`,
  ])("breaks the Markdown image %s", (input) => {
    expect(withoutRemoteContent(input)).not.toContain("![");
  });

  it.each([
    `<img src="${U}">`,
    `<IMG SRC="${U}">`,
    `<img\nsrc="${U}">`,
    `<img/src="${U}">`,
    `<image src="${U}">`,
    `<video src="${U}"></video>`,
    `<audio src="${U}"></audio>`,
    `<picture><source srcset="${U}"></picture>`,
    `<iframe src="${U}"></iframe>`,
    `<svg><image href="${U}"/></svg>`,
    `<details><summary>s</summary><img src="${U}"></details>`,
    `<a href="https://example.com"><img src="${U}"></a>`,
  ])("breaks the HTML %s", (input) => {
    expect(withoutRemoteContent(input)).not.toMatch(/<(img|image|video|audio|picture|source|iframe|svg)/iu);
  });

  it("does not mistake a longer tag name for a safe one", () => {
    expect(withoutRemoteContent("<abbr>")).toBe("<​abbr>");
  });

  it.each(["**bold** [a](https://example.com)", "<details><summary>s</summary>x</details>", "<https://example.com>", "a < b && !c", "<br/>"])(
    "leaves %s alone",
    (input) => {
      expect(withoutRemoteContent(input)).toBe(input);
    },
  );
});
