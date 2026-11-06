# PR Lens documents are our diagram format

The Explain tab's diagrams and walkthrough are a PR Lens `GraphDoc` (`@coldtea/pr-lens-schema`), written by the analysis agent and drawn by `@coldtea/pr-lens-renderer`, both MIT and pinned to exact versions. We dropped our own diagram schema and the dagre canvas, and the narrative, rather than translating our format into theirs or building a lookalike renderer: their document carries lanes, flows, data models and a walkthrough ours never had, and their renderer gives deterministic layout plus an atlas of element boxes that our comment pins and click targets sit on.

## Considered options

- **Replicate the look on our own schema and dagre.** Full control, no outside dependency, but we would rebuild lanes, sequence layout and animation, and keep chasing their design.
- **Keep our schema, translate to theirs at render time.** Loses everything our schema cannot say, so it buys the look without the substance.

## Consequences

- The schema is pre-1.0 and moves fast. Upgrades are deliberate, and a schema bump can invalidate stored analyses.
- Analyses stored in the old format are not migrated; Explain asks for a re-run instead.
- Diagram comments pin to nodes and tables only, keyed by view or flow id plus element id.
- The server renders, not the app. The renderer's entry point imports `node:crypto`, so it cannot be bundled into the app (found in the #27 prototype). After analysis, the server renders every view in both light and dark and stores each SVG with its atlas beside the `GraphDoc`. The app only displays stored renders, and the dependency stays out of the app bundle. A renderer or schema upgrade therefore means re-rendering stored analyses.
