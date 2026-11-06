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
