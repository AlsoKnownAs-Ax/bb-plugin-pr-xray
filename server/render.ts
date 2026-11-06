// Draws each diagram tab of a PR Lens document in light and dark. Server-only:
// the renderer imports node:crypto, so the app shows these stored renders.
import { paletteFor, render } from "@coldtea/pr-lens-renderer";
import type { GraphDoc } from "@coldtea/pr-lens-schema";
import { diagramTabs, type DiagramTab } from "../shared/diagram-tabs";
import type { AnalysisResult, DiagramRender } from "../shared/schema";

export function renderDiagrams(doc: GraphDoc): AnalysisResult["renders"] {
  return Object.fromEntries(
    diagramTabs(doc).map((tab) => {
      const scoped = scopedTo(doc, tab);
      const draw = (theme: "light" | "dark"): DiagramRender => {
        const { svg, width, height, atlas } = render(scoped, { lens: tab.lens, theme, view: tab.view });
        return { svg, width, height, atlas, background: paletteFor(theme).background };
      };
      return [tab.id, { light: draw("light"), dark: draw("dark") }];
    }),
  );
}

/** A flow tab draws only its own flow. */
function scopedTo(doc: GraphDoc, tab: DiagramTab): GraphDoc {
  if (tab.flow === undefined) {
    return doc;
  }

  return { ...doc, flows: doc.flows.filter((flow) => flow.id === tab.flow) };
}
