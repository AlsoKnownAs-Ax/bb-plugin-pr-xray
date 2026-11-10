import { describe, expect, it } from "vitest";
import type { PrDetails } from "../shared/schema";
import { askUnlessSkipped, needsAgentWarning, rememberDontAskAgain } from "./agent-trust";

const comment = (author: string) => ({ author });
const pr = (isOwnPr: boolean, ...authors: string[]) =>
  ({ isOwnPr, viewer: "ann", threads: [{ comments: authors.map(comment) }] }) as unknown as PrDetails;

describe("warning before an agent reads other people's text", () => {
  it("warns a fix on someone else's PR, because the agent works in their branch", () => {
    expect(needsAgentWarning(pr(false), "fix")).toBe(true);
    expect(needsAgentWarning(pr(true, "mallory"), "fix")).toBe(false);
  });

  it("warns for every job on someone else's PR", () => {
    expect(needsAgentWarning(pr(false), "analysis")).toBe(true);
    expect(needsAgentWarning(pr(false), "chat")).toBe(true);
  });

  it("stays quiet on your own PR with only your comments", () => {
    expect(needsAgentWarning(pr(true, "Ann"), "analysis")).toBe(false);
    expect(needsAgentWarning(pr(true, "Ann"), "chat")).toBe(false);
  });

  it("warns chat on your own PR when others commented, because chat reads the threads", () => {
    expect(needsAgentWarning(pr(true, "ann", "mallory"), "chat")).toBe(true);
    expect(needsAgentWarning(pr(true, "ann", "mallory"), "analysis")).toBe(false);
  });
});

describe("skip trust prompts setting", () => {
  const ask = () => Promise.resolve(false);

  it("doesn't ask when the setting is on", async () => {
    await expect(askUnlessSkipped(() => Promise.resolve(true), ask)).resolves.toBe(true);
  });

  it("asks when the setting is off", async () => {
    await expect(askUnlessSkipped(() => Promise.resolve(false), ask)).resolves.toBe(false);
  });

  it("asks when the setting can't be read", async () => {
    await expect(askUnlessSkipped(() => Promise.reject(new Error("offline")), ask)).resolves.toBe(false);
  });
});

describe("don't ask again for any PR", () => {
  const run = (accepted: boolean, ticked: boolean, save: () => Promise<unknown>) => {
    const errors: unknown[] = [];
    const saves = { count: 0 };
    rememberDontAskAgain(accepted, ticked, () => (saves.count++, save()), (cause) => errors.push(cause));
    return { saves, errors };
  };

  it("turns the setting on when ticked and Continue is pressed", () => {
    expect(run(true, true, () => Promise.resolve()).saves.count).toBe(1);
  });

  it("saves nothing on Cancel or close, even when ticked", () => {
    expect(run(false, true, () => Promise.resolve()).saves.count).toBe(0);
  });

  it("saves nothing when the box isn't ticked", () => {
    expect(run(true, false, () => Promise.resolve()).saves.count).toBe(0);
  });

  it("reports a failed save", async () => {
    const failure = new Error("offline");
    const { errors } = run(true, true, () => Promise.reject(failure));
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toEqual([failure]);
  });
});
