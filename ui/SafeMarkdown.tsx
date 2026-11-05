import { Markdown } from "@get-bb/plugin-sdk/app";
import { withoutRemoteContent } from "./remote-content";

/** Use this, not Markdown, for anything a PR, a comment or an agent wrote. */
export function SafeMarkdown({ content, className }: { content: string; className?: string }) {
  return <Markdown content={withoutRemoteContent(content)} {...(className ? { className } : {})} />;
}
