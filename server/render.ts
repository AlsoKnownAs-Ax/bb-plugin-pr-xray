// Draws each diagram tab of a PR Lens document in light and dark. Server-only:
// the renderer imports node:crypto, so the app shows these stored renders.
import { paletteFor, render } from "@coldtea/pr-lens-renderer";
import type { GraphDoc } from "@coldtea/pr-lens-schema";
import { diagramTabs } from "../shared/diagram-tabs";
import type { AnalysisResult, DiagramRender } from "../shared/schema";

export function renderDiagrams(doc: GraphDoc): AnalysisResult["renders"] {
  const renders: AnalysisResult["renders"] = {};
  for (const tab of diagramTabs(doc)) {
    const scoped = tab.flow === undefined ? doc : { ...doc, flows: doc.flows.filter((flow) => flow.id === tab.flow) };
    const draw = (theme: "light" | "dark"): DiagramRender => {
      const { svg, width, height, atlas } = render(scoped, { lens: tab.lens, theme, view: tab.view });
      return { svg, width, height, atlas, background: paletteFor(theme).background };
    };
    renders[tab.id] = { light: draw("light"), dark: draw("dark") };
  }
  return renders;
}
