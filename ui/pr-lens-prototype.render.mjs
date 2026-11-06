// PROTOTYPE (issue #27): the renderer imports node:crypto, so it cannot run in
// the app bundle. Render on Node (as the server would) and ship SVG + atlas.
// Run: node ui/pr-lens-prototype.render.mjs
import { writeFileSync } from "node:fs";
import { flattenViews, paletteFor, render } from "@coldtea/pr-lens-renderer";
import { billingOrgGraph, postmarkRefactorGraph } from "@coldtea/pr-lens-schema/examples";

const docs = {
  "postmark-refactor (architecture + flow)": postmarkRefactorGraph,
  "billing-org (architecture + data model)": billingOrgGraph,
};
const out = {};
for (const [name, doc] of Object.entries(docs)) {
  const views = flattenViews(doc.views).map(({ children: _children, ...view }) => view);
  const renders = {};
  for (const view of views)
    for (const theme of ["light", "dark"]) {
      const { svg, width, height, animated, atlas } = render(doc, { lens: view.lens, theme, view: view.id });
      renders[`${view.id}:${theme}`] = { svg, width, height, animated, atlas, background: paletteFor(theme).background };
    }
  out[name] = { views, walkthrough: doc.walkthrough?.steps ?? [], renders };
}
writeFileSync(new URL("./pr-lens-prototype.renders.json", import.meta.url), JSON.stringify(out));
