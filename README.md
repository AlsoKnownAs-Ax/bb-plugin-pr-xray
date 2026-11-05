# PR X-ray for bb

Self-review GitHub pull requests before asking for review:

- **Diff tab**: hunks grouped by concern and ordered as a reading path (noise last), with viewed checkmarks, split/unified view and GitHub-style inline comments: single comments, start/submit a review, suggestions, replies, editing your posted comments and resolve.
- **Explain tab**: a summary informed by the linked Notion ticket and its parent project, a walkthrough, "where to look closely", and interactive diagrams. Click a node to leave a design comment (kept in bb only).
- **Fix with agents**: fix one thread, fix your open review comments or all open comments (one button, with a dropdown that remembers your choice), or redesign from all diagram comments (plan first, then waits for your approval). Each start shows a toast with a link to the thread.
- **New commits**: the page stays on the commit you are reading. A banner offers Refresh when new commits arrive, so the code never jumps. It checks about once a minute while the page is visible.
- **Retro feed**: tag comments yourself or click “AI tag”; `bb pr-xray comments --json` exports them.

## Install

```sh
bb plugin install git:github.com/AlsoKnownAs-Ax/bb-plugin-pr-xray
```

Open it with the command palette (**PR X-ray: Review a pull request**; bind a shortcut in Settings → Keyboard), from the **PR X-ray** page in the nav rail, by asking any agent to "x-ray <PR url>", or with `bb pr-xray review <url>`.

## Setup

- **GitHub**: uses your `gh` login by default, so if `gh auth status` shows you're logged in, there's nothing to set up. To use a token instead, see [Create a GitHub token](#create-a-github-token).
- **Notion**: the analysis agent reads the ticket through your agent provider's Notion connection, so Notion must be connected for the provider you analyse with. The ticket is the first link matching *Ticket URL pattern* in the PR description (default: `notion.so` / `notion.com` links), and the parent project is followed through the *Notion parent project property* relation (default `Project`).
- **Models**: PR X-ray uses your bb default model unless you choose others under Settings → Plugins → PR X-ray. Analysis and chat share one setting, and AI tagging has its own.
- **Repository context**: when a bb project on the same machine as bb's server has a git remote matching the PR's repository, the analysis and chat agents read a disposable copy of the PR's commit, never your own checkout. Your checkout and any agents working in it are untouched, and setup scripts from the PR branch don't run. PR X-ray deletes the copy when the agent's thread is archived. An open chat keeps its copy until you reset the chat. Fork PRs, and projects where the copy can't be made, use the diff only, and analyses show a badge saying so. Fix threads also run in a copy, so they need a bb project on that machine, and aren't available for fork PRs. Push a fix before archiving its thread, because unpushed commits go with the copy.

## Create a GitHub token

You only need this if you don't use the `gh` CLI, or want PR X-ray limited to certain repositories.

1. Open [the new token form](https://github.com/settings/personal-access-tokens/new?name=PR+X-ray&description=Used+by+the+PR+X-ray+bb+plugin&contents=read&pull_requests=write), which fills in the name and permissions below. To get there by hand, go to GitHub **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Under **Expiration**, pick a date. You'll need a new token when it expires.
3. Under **Resource owner**, choose the user or organization that owns the repositories you review.
4. Under **Repository access**, choose **Only select repositories** and pick them.
5. Check the permissions, then click **Generate token** and copy it:

   | Repository permission | Access | Used for |
   |---|---|---|
   | Pull requests | Read and write | Reading PRs, posting and editing comments, submitting reviews |
   | Contents | Read | Showing full files |

   GitHub adds *Metadata: read* itself. PR X-ray doesn't need any other permission.
6. In bb, paste it under **Settings → Plugins → PR X-ray → GitHub token**. The page should then say *Connected as* your GitHub username.

If the resource owner is an organization that requires approval, the token only reads public resources until an admin approves it.

The token is only for PR X-ray's GitHub requests. A fix agent pushes with the git credentials on your machine, so those need write access to the PR's branch.

## Security

**Only use agents on PRs you trust.** Analyse, chat, fix and AI tagging run agents that read PR content such as its code, description and comments. Text in a PR can try to instruct those agents. A steered agent could use your GitHub login, call PR X-ray's commands (including approving or commenting) and read local files. An image in a chat reply could also send data out, with no click needed. Viewing a diff and commenting by hand don't run agents.

PR titles, descriptions, diffs and branch files are untrusted, and a malicious PR can try to prompt-inject the agents that read them. Those agents run in a disposable copy of the PR's commit, or with no repository, and are told to treat PR content as data and stay off the network. That instruction is not a security boundary.

**With Codex, analysis and chat agents have network access.** bb's Codex workspace sandbox always allows it and PR X-ray can't turn it off, so an injected agent could reach the internet, run `gh` with your login and read files on your machine. Other providers depend on their own sandbox and approval settings, so don't treat those as a hard boundary either.

Trust matters most for PRs from people outside your team. PR X-ray asks you to confirm once per PR before an agent works on someone else's PR, or chats over other people's comments. It can't see commits or edits others made to your own PR.

Comments and analysis text can't load remote images or media in PR X-ray: they show as links or plain text.

**Fix agents can push to the PR branch.** *Fix with agent* and *Fix my open comments* send only your own comments to the agent. *Fix all open comments* and *Include others' comments* also send everyone else's, and on a public repo anyone can post one, so they ask you to confirm every time. The agent is told when comments were left out, because a reply can make little sense without what it answers.

## `bb pr-xray comments --json`

```json
{ "since": "...", "count": 1, "comments": [
  { "id": "cm_…", "source": "diff|diagram", "repo": "owner/name", "pr": 123,
    "tag": "missing-test", "status": "open|resolved|outdated", "body": "…",
    "path": "src/x.ts", "line": 42, "diagramNode": null,
    "githubUrl": "https://github.com/…", "createdAt": "2026-10-23T…" } ] }
```

Options: `--since 30d|12w|<ISO date>`, `--repo`, `--source`, `--tag`, `--limit`.

## Develop

```sh
npm install --include=dev
bb plugin install .
bb plugin dev
```

Run `npm run check` for linting (oxlint), type checking and tests.
