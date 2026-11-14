# Explain is for reviewing, not design work

The Explain tab exists to help someone review a PR, whether it's theirs or someone else's. Design comments and the "Fix all design comments" agent are about planning and redesigning your own work, so they come out of Explain. Commenting there now happens on code, in the Code panel, using the same review comments and ask-chat as the Diff tab. Design comments will come back later in a separate tab built around working with the agent.

We remove the feature surface (the UI, the pins, the fix-all agent and the `diagram.*Comment` RPCs) but keep the stored design comments and their schema untouched, so the future tab can pick them up. Until then nothing shows it. The only thing that still touches it is the bookkeeping that marks a comment outdated when a re-analysis drops its node, so the data is still accurate when the tab returns.

## Considered options

- **Delete the feature and its stored data.** Cleaner, but it throws away comments the planned tab will want.
- **Keep design comments in Explain beside the Code panel.** That would leave two kinds of comment in one tab, and the tab would keep two jobs.

## Consequences

- A stored-comments table with no reader exists until the design tab ships. Don't delete it as dead.
- Design comments were only ever available on your own PR. Code panel comments work on any PR.
