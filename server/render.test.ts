import { postmarkRefactorGraph } from "@coldtea/pr-lens-schema/examples";
import { describe, expect, it } from "vitest";
import { renderDiagrams } from "./render";

describe("diagram renders", () => {
  it("draw each flow tab with only its own flow", () => {
    const pipeline = postmarkRefactorGraph.flows[0]!;
    const doc = { ...postmarkRefactorGraph, flows: [pipeline, { ...pipeline, id: "retry", title: "Retry" }] };

    const renders = renderDiagrams(doc);

    expect(Object.keys(renders)).toEqual(["overview", "send-pipeline", "retry"]);
    expect(Object.keys(renders["send-pipeline"]!.light.atlas.messages)).toEqual(["send-pipeline"]);
    expect(Object.keys(renders.retry!.dark.atlas.messages)).toEqual(["retry"]);
  });
});
