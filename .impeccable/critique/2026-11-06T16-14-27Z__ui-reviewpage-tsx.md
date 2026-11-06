---
target: ui/ReviewPage.tsx review page
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\andre\\Documents\\GitHub\\bb-plugin-pr-xray\\ui\\ReviewPage.tsx"
target_fingerprint: "sha256:f27aa42d88432dbc24ce986ca5ea891d4f4b5e0d38b595765ad836ffb3351e28"
target_path: "C:\\Users\\andre\\Documents\\GitHub\\bb-plugin-pr-xray\\ui\\ReviewPage.tsx"
timestamp: 2026-11-06T16-14-27Z
slug: ui-reviewpage-tsx
---
⚠️ DEGRADED: single-context (run as a forked worker that may not spawn sub-agents; Assessment A finished before detector ran). Browser inspection skipped: the plugin only renders inside bb, no standalone URL. Critique is from source.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good progress strip, banners, toasts; viewed toggle shows success even when the save fails |
| 2 | Match System / Real World | 3 | Reviewer language throughout; "Run" header button and "Noise" kind are opaque |
| 3 | User Control and Freedom | 3 | Cancel/Esc everywhere; diagram comment Delete has no confirm or undo |
| 4 | Consistency and Standards | 2 | Warning amber means 4 different things; three "×" text-glyph close buttons; tab switch is ghost buttons, not tabs |
| 5 | Error Prevention | 3 | Strong agent-consent and approve guards; Delete and "Add single comment" (posts to GitHub immediately) unguarded |
| 6 | Recognition Rather Than Recall | 2 | 1/2/f shortcuts only in aria-labels; j/k/n/p/c hint only in the diff sidebar footer |
| 7 | Flexibility and Efficiency | 3 | j/k/n/p/c, f, 1/2, remembered view and fix scope; no key for Viewed |
| 8 | Aesthetic and Minimalist Design | 3 | Up to 4 stacked banners plus a permanent ticket row above the content; crowded header |
| 9 | Error Recovery | 2 | Optimistic viewed state never rolls back; raw error strings in failed banner and load error |
| 10 | Help and Documentation | 3 | Inline hints, chat suggestions, honest security copy |
| **Total** | | **27/40** | **Acceptable** (top of band) |

## Design Specificity Verdict
LLM: Authored for this product. The reading-path sidebar with progress, kind chips, "changed since you viewed", diagram pins and the split Fix button are the product's mechanism made visible. Visual language is intentionally bb-native (kit components, tokens), right for an Operate surface.
Detector: 3 side-tab findings (border-l-4): ExplainTab.tsx:166 (Where to look closely), comments.tsx:246 (thread card), comments.tsx:406 (pending comment). Agreed for ExplainTab:166 and comments.tsx:406; comments.tsx:246 is a GitHub-style thread marker, borderline.
Visual overlays: none (no browser target).

## Priority Issues
1. [P1] Banner stack and permanent ticket row eat the reading area. ReviewPage.tsx:226-245, 404-441. Fix: move ticket link + Change into the header meta row; keep a banner only when no ticket is linked; merge stale + failed into one analysis-status row. Command: /impeccable distill
2. [P1] Viewed toggle lies on failure. ReviewPage.tsx:108-113: local override is set, RPC failure only toasts, checkbox stays checked. Fix: revert the fingerprints in localViewed in the catch. Command: /impeccable harden
3. [P2] Warning amber is overloaded. DiffTab.tsx:612 (updated), 618 (open comment count), 363, 333; comments.tsx:406 (pending); ReviewPage.tsx:377 (new commits). Comment count is not a warning. Fix: neutral count chip, reserve amber for "changed since viewed" + pending; drop border-l-4 side tabs (ExplainTab:166, comments.tsx:406). Command: /impeccable polish
4. [P2] Header is crowded and inconsistent. ReviewPage.tsx:184-223: Diff/Explain as aria-pressed ghost buttons (no tablist), "Run" label unclear, Focus/Exit focus plus a second × in focus mode; "×" text glyphs at ReviewPage:221, ExplainTab:318, ChatBubble:98. Fix: real tabs, rename Run -> "Analysis run", one exit control, Icon X. Command: /impeccable layout
5. [P2] Shortcuts undiscoverable; diagram Delete unguarded. ReviewPage.tsx:76-90, DiffTab.tsx:393, ExplainTab.tsx:278. Fix: shortcut hint/tooltip in header (f, 1/2) and a "?" sheet; undo toast for Delete. Command: /impeccable harden

## Persona Red Flags
Alex (power user): no key to mark the current hunk/file viewed (the main repeated action); 1/2/f exist but nothing tells him; Re-analyse needs a mouse.
Sam (a11y): Diff/Explain not a tablist; many 10-11px labels (DiffTab:361, ExplainTab:169, DiagramCanvas kind label); active hunk ring set on pointerdown only, so j/k focus is visual only; open-comment pin conveys open vs resolved by fill colour alone.

## Minor Observations
- ChatBubble floats over the diff's bottom-right; ExplainTab works around it with pr-20 (ExplainTab:209).
- "No analysis yet." (ReviewPage:291) gives no action; the Analyse button is in the header.
- Group header has both a chevron button and a title button that do the same thing (DiffTab:406-419).
- Severity in Where to look closely duplicates border colour and uppercase text.

## Questions to Consider
- Does the ticket need a permanent row, or is it header metadata?
- What if marking viewed were one keystroke, so the reading path became a true keyboard flow?
- Should amber mean one thing only: "this changed under you"?
