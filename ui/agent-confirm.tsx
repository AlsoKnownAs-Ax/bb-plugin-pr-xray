// The dialogs that ask before an agent reads text the user didn't write.
import { useRpc } from "@get-bb/plugin-sdk/app";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { rpcContract } from "../shared/contract";
import { prRefKey } from "../shared/pr-ref";
import type { PrDetails, PrRef } from "../shared/schema";
import { askUnlessSkipped, needsAgentWarning, rememberDontAskAgain, type AgentJob } from "./agent-trust";
import { errorMessage } from "./useReview";

interface AgentConfirm {
  /** Asks once per PR, and only when other people's text is involved. */
  confirmAgent: (job: AgentJob) => Promise<boolean>;
  /** Asks every time: this agent can push, and it reads everyone's comments. */
  confirmOthersComments: () => Promise<boolean>;
}

/** Outside a review page there is nobody to ask, so the answer is no. */
const AgentConfirmContext = createContext<AgentConfirm>({
  confirmAgent: () => Promise.resolve(false),
  confirmOthersComments: () => Promise.resolve(false),
});

export const useAgentConfirmContext = () => useContext(AgentConfirmContext);

const COPY = {
  agent: {
    title: "Let an agent read someone else's text?",
    description:
      "This PR has content written by other people, and a malicious PR or comment can prompt-inject the agent that reads it. With Codex, that agent can reach the internet and run gh with your login. Continue only if you trust everyone who wrote this PR and its comments.",
    action: "Continue",
  },
  others: {
    title: "Send everyone's comments to a fix agent?",
    description:
      "An agent that can push to this branch will read the comments, including ones from other people. On a public repo anyone can post a comment, and its text could prompt-inject the agent. Continue only if you trust everyone who commented.",
    action: "Fix with all comments",
  },
};

export function useAgentConfirm(prRef: PrRef, pr: PrDetails | null) {
  const rpc = useRpc<typeof rpcContract>();
  const warningKey = `pr-xray:agent-warning:${prRefKey(prRef)}`;
  const [question, setQuestion] = useState<{ kind: keyof typeof COPY; answer: (accepted: boolean) => void } | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  // A ref, so these callbacks stay the same while the review data refreshes.
  const latestPr = useRef(pr);
  latestPr.current = pr;
  // Read on every ask, so turning the setting on or off applies to open review pages.
  const skipTrustPrompts = useCallback(async () => {
    const result = await rpc.call("settings.getSkipTrustPrompts");
    return result.skipTrustPrompts;
  }, [rpc]);

  const confirmAgent = useCallback(
    (job: AgentJob) => {
      const current = latestPr.current;
      if (current === null || !needsAgentWarning(current, job) || localStorage.getItem(warningKey)) return Promise.resolve(true);
      return askUnlessSkipped(
        skipTrustPrompts,
        () =>
          new Promise<boolean>((resolve) =>
            setQuestion({
              kind: "agent",
              answer: (accepted) => {
                if (accepted) localStorage.setItem(warningKey, "accepted");
                resolve(accepted);
              },
            }),
          ),
      );
    },
    [warningKey, skipTrustPrompts],
  );
  const confirmOthersComments = useCallback(
    () =>
      askUnlessSkipped(skipTrustPrompts, () => new Promise<boolean>((resolve) => setQuestion({ kind: "others", answer: resolve }))),
    [skipTrustPrompts],
  );

  const answer = (accepted: boolean) => {
    rememberDontAskAgain(
      accepted,
      dontAskAgain,
      () => rpc.call("settings.setSkipTrustPrompts", { skip: true }),
      (cause) => toast.error(errorMessage(cause)),
    );
    question?.answer(accepted);
    setQuestion(null);
    setDontAskAgain(false);
  };
  const copy = question ? COPY[question.kind] : null;
  const dialog = (
    <Dialog open={question !== null} onOpenChange={(open) => !open && answer(false)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{copy?.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={dontAskAgain}
              onCheckedChange={(checked) => setDontAskAgain(checked === true)}
              aria-describedby="dont-ask-again-hint"
            />
            Don't ask again for any PR
          </label>
          {/* pl-6 lines the hint up under the label text: checkbox (1rem) + gap (0.5rem). */}
          <p id="dont-ask-again-hint" className="pl-6 text-xs text-muted-foreground">
            You can turn this back on in Settings.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => answer(false)}>
            Cancel
          </Button>
          <Button onClick={() => answer(true)}>{copy?.action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return { confirmAgent, confirmOthersComments, dialog };
}

export function AgentConfirmProvider({ value, children }: { value: AgentConfirm; children: ReactNode }) {
  return <AgentConfirmContext.Provider value={value}>{children}</AgentConfirmContext.Provider>;
}
