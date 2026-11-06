# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers who review GitHub pull requests inside bb, the agentic IDE. Two equal audiences: the author's own team of reviewers, and any bb user who installs the public plugin. The job: understand a PR before reviewing it, often with a linked Notion ticket, then comment, review and get fixes made without leaving bb.

## Product Purpose

PR X-ray turns a pull request into something you can read and understand before you review it. It shows the diff grouped by concern, an explanation with diagrams, and GitHub-style inline comments, and it lets bb agents fix the comments. Success means a reviewer understands the change quickly, then leaves accurate comments and gets them resolved.

## Positioning

- **Reading order:** hunks are grouped by concern and ordered as a reading path, with noise last, unlike GitHub's file-by-file view.
- **Ticket context:** the explanation uses the linked Notion ticket and its parent project, not just the diff.
- **Fix loop in bb:** review comments and diagram comments become bb agent threads that fix the code and push to the PR branch.

## Operating Context

- Runs as a bb plugin (`app.tsx` UI, `server.ts` server). It opens from the command palette, the PR X-ray page in the nav rail, an agent asked to "x-ray <PR url>", or `bb pr-xray review <url>`.
- Surfaces: home page, Open PR dialog, review page with **Diff** and **Explain** tabs, comment threads, Fix buttons and dropdown, chat bubble, plugin settings section.
- GitHub through the `gh` login or a fine-grained token. Notion through the agent provider's Notion connection.
- Agents work in a throwaway clone of the PR's commit, never the user's checkout.

## Capabilities and Constraints

- Diff: split and unified views, viewed checkmarks, single comments, reviews, suggestions, replies, editing posted comments, resolve.
- Explain: summary, walkthrough, "where to look closely", interactive diagrams. Diagram comments are kept in bb only.
- The page stays on the commit being read. A banner offers Refresh when new commits arrive.
- Retro feed: comment tags (manual or AI) exported with `bb pr-xray comments --json`.
- UI must look native inside bb: reuse bb's UI kit (`components/ui`) and theme, and support light and dark.
- Comments and analysis text never load remote images or media. They render as links or plain text.
- PR content is untrusted. Agent actions on other people's PRs or comments need explicit confirmation in the UI.

## Brand Commitments

- Name: "PR X-ray". bb branding icon: `GitPullRequest`.
- Voice in docs and UI: plain, direct, short sentences. Security warnings are stated outright.

## Evidence on Hand

- README.md and PLUGIN_OVERVIEW.md describe features, setup and security.
- No testimonials, user counts, benchmarks or press exist. Do not invent them.

## Product Principles

1. Understanding comes before judgment: help the reviewer read the change before asking them to comment.
2. Never move the ground under the reader: no code jumps, no silent refreshes.
3. Agents act only with consent, and the UI says plainly what they will see and do.
4. Belong in bb: feel like part of the IDE, not a separate app.

## Accessibility & Inclusion

No product-specific standard was set. Follow bb's existing patterns, including coarse-pointer and reduced-motion handling.
