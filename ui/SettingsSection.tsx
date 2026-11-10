// Settings page section: GitHub identity and the models PR X-ray's agents use.
import { useCallback, useEffect, useState } from "react";
import { experimental_ProviderModelPicker as ProviderModelPicker, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import type { rpcContract } from "../shared/contract";
import type { ModelPurpose, ModelSelection } from "../shared/schema";
import { ReportBugFooter } from "./ReportBug";
import { errorMessage } from "./useReview";

interface State {
  identity: { login: string; source: "token" | "gh" } | null;
  identityError: string | null;
  models: Record<ModelPurpose, ModelSelection | null>;
  pickerSeed: ModelSelection | null;
  skipTrustPrompts: boolean;
}

function ModelSetting(props: {
  title: string;
  description: string;
  selection: ModelSelection | null;
  pickerSeed: ModelSelection | null;
  onChange: (selection: ModelSelection | null) => void;
}) {
  const { title, description, selection, pickerSeed, onChange } = props;
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{title}</div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="flex flex-wrap items-center gap-2">
        {selection ? (
          <>
            <ProviderModelPicker
              value={{
                providerId: selection.providerId,
                model: selection.model,
                reasoningLevel: selection.reasoningLevel as never,
                ...(selection.serviceTier ? { serviceTier: selection.serviceTier as never } : {}),
              }}
              onChange={(value) =>
                onChange({
                  providerId: value.providerId,
                  model: value.model,
                  reasoningLevel: value.reasoningLevel,
                  ...(value.serviceTier ? { serviceTier: value.serviceTier } : {}),
                })
              }
            />
            <Button size="sm" variant="outline" onClick={() => onChange(null)}>
              Use bb default
            </Button>
          </>
        ) : (
          <>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium">bb default</span>
            {pickerSeed ? (
              <Button size="sm" variant="outline" onClick={() => onChange(pickerSeed)}>
                Choose a model
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** The footer sits outside the form so the bug link stays reachable while settings load or fail to load. */
export function SettingsSection() {
  return (
    <div className="space-y-6">
      <SettingsForm />
      <ReportBugFooter />
    </div>
  );
}

function SettingsForm() {
  const rpc = useRpc<typeof rpcContract>();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    rpc.call("settings.get").then(
      (result) => setState(result),
      (cause: unknown) => setError(errorMessage(cause)),
    );
  }, [rpc]);
  useEffect(load, [load]);

  const save = async (purpose: ModelPurpose, selection: ModelSelection | null) => {
    try {
      await rpc.call("settings.setModel", { purpose, selection });
      load();
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  };

  const setSkipTrustPrompts = async (skip: boolean) => {
    setState((current) => (current ? { ...current, skipTrustPrompts: skip } : current));
    try {
      await rpc.call("settings.setSkipTrustPrompts", { skip });
    } catch (cause) {
      toast.error(errorMessage(cause));
      load();
    }
  };

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!state) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <>
      <div className="space-y-1">
        <div className="text-sm font-medium">GitHub</div>
        {state.identity ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Icon name="CircleCheck" className="size-4" />
            Connected as <span className="font-medium text-foreground">@{state.identity.login}</span> via{" "}
            {state.identity.source === "token" ? "the token above" : "your gh login"}.
          </p>
        ) : (
          <p className="text-sm text-destructive">{state.identityError}</p>
        )}
      </div>

      <ModelSetting
        title="Analysis and chat model"
        description="Used for grouping, explanations, diagrams and questions about a PR. A mid-size model is usually enough."
        selection={state.models.analysis}
        pickerSeed={state.pickerSeed}
        onChange={(selection) => void save("analysis", selection)}
      />
      <ModelSetting
        title="AI tagging model"
        description="Used when “AI tag” categorises a comment. Your cheapest model is usually enough."
        selection={state.models.tagging}
        pickerSeed={state.pickerSeed}
        onChange={(selection) => void save("tagging", selection)}
      />

      <div className="flex items-start gap-2">
        <Checkbox
          id="skip-trust-prompts"
          className="mt-0.5"
          checked={state.skipTrustPrompts}
          onCheckedChange={(checked) => void setSkipTrustPrompts(checked === true)}
          aria-describedby="skip-trust-prompts-description"
        />
        <div className="space-y-1">
          <label htmlFor="skip-trust-prompts" className="text-sm font-medium">
            Skip trust prompts
          </label>
          <p id="skip-trust-prompts-description" className="text-sm text-muted-foreground">
            Agents will run on any PR without asking first, even when they read text other people wrote, which can try to
            prompt-inject them. This includes “Fix all open comments” and “Include others’ comments”, which run an agent that can push to the branch.
          </p>
        </div>
      </div>
    </>
  );
}
