# PR X-ray

Reviewing a GitHub pull request inside bb, with the diff reorganised into an order a human can read.

## Language

**Group**:
A set of related hunks from one PR, possibly spanning several files, with a title and a kind (core, supporting, tests, noise).
_Avoid_: Section, chunk, cluster

**Reading path**:
The ordered list of a PR's groups, which is the suggested order to review it in.
_Avoid_: Outline, table of contents

**Viewed**:
A mark the reviewer puts on a hunk once they've read it. A file or group is viewed when every hunk in it is viewed.
_Avoid_: Read, seen, reviewed

**File tree**:
The PR's changed files arranged by directory, showing where the change lands in the repo regardless of the reading path.
_Avoid_: File list, file explorer, files panel

**Diagram**:
A picture of the PR's change, seen through one lens.
_Avoid_: Chart, graph, canvas

**Lens**:
The angle a diagram takes on the change: architecture (which parts were added, changed or removed, lane by lane), data-flow (the calls a request makes, in order) or data-model (the tables touched and the keys between them).
_Avoid_: Diagram kind, view type

**Walkthrough**:
A short guided tour of the change: a few steps, each showing one diagram, pointing at part of it, and saying in a line what changed there.
_Avoid_: Narrative, tour, story

**Design comment**:
A note pinned to a node or table on a diagram, saying the design is wrong there. Kept in bb only, never posted to GitHub, and only available on your own PR.
_Avoid_: Diagram comment, node comment

**Focus mode**:
The review filling the whole window, with bb's surroundings hidden.
_Avoid_: Full screen, zen mode

**Trust prompt**:
A question asking the reviewer to confirm before an agent reads text someone else wrote, such as another person's PR or comments. The reviewer can turn trust prompts off for every PR.
_Avoid_: Trusted mode, trust dialog, malicious-code warning

**Code panel**:
The code behind what the reviewer is looking at in the explanation (the current walkthrough step or the selected part of a diagram), where they can comment on it or ask about it.
_Avoid_: Right tab, drawer, side panel

**Spotlight**:
The part of a diagram a walkthrough step (or a cite in it) zooms to, with the rest dimmed.
_Avoid_: Focus, highlight
