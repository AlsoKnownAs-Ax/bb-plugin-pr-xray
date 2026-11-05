import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { ReviewGet, rpcContract } from "../shared/contract";
import type { PrRef } from "../shared/schema";
import { prRefKey } from "../shared/pr-ref";
import { holdShownCommit } from "./hold-commit";

const HEAD_CHECK_MS = 60_000;

export type Rpc = ReturnType<typeof useRpc<typeof rpcContract>>;
export type { ReviewGet };

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) return String(error.message);
  return String(error);
}

/** Loads one PR's review state, keeps it fresh from realtime signals, and holds the shown commit until `refresh`. */
export function useReview(ref: PrRef) {
  const rpc = useRpc<typeof rpcContract>();
  const [data, setData] = useState<ReviewGet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestHead, setLatestHead] = useState<string | null>(null);
  const key = prRefKey(ref);
  const latestKey = useRef(key);
  latestKey.current = key;
  const refRef = useRef(ref);
  refRef.current = ref;

  const refetch = useCallback(() => {
    const requested = key;
    rpc.call("review.get", { ref: refRef.current }).then(
      (result) => {
        if (latestKey.current !== requested) return;
        setData((shown) => holdShownCommit(shown, result));
        setLatestHead(result.pr.headSha);
        setError(null);
      },
      (cause: unknown) => {
        if (latestKey.current === requested) setError(errorMessage(cause));
      },
    );
  }, [rpc, key]);

  /** Shows the PR's latest commit. */
  const refresh = useCallback(async () => {
    const requested = key;
    const result = await rpc.call("review.get", { ref: refRef.current, fresh: true });
    if (latestKey.current !== requested) return;
    setData(result);
    setLatestHead(result.pr.headSha);
  }, [rpc, key]);

  useEffect(() => {
    setData(null);
    setError(null);
    setLatestHead(null);
    refetch();
  }, [refetch]);

  // GitHub doesn't tell the plugin about pushes.
  useEffect(() => {
    const requested = key;
    const checkHead = () => {
      if (document.hidden) return;
      rpc.call("review.head", { ref: refRef.current }).then(
        ({ headSha }) => {
          if (latestKey.current === requested) setLatestHead(headSha);
        },
        () => undefined,
      );
    };
    const timer = setInterval(checkHead, HEAD_CHECK_MS);
    window.addEventListener("focus", checkHead);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", checkHead);
    };
  }, [rpc, key]);

  const onSignal = useCallback(
    (payload: unknown) => {
      if ((payload as { key?: string } | null)?.key === key) refetch();
    },
    [key, refetch],
  );
  useRealtime("analysis-changed", onSignal);
  useRealtime("comments-changed", onSignal);

  const newCommits = data !== null && latestHead !== null && latestHead !== data.pr.headSha;
  return { rpc, data, error, refetch, refresh, newCommits };
}
