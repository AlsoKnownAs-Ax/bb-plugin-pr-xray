// PR comments and analysis text are written by others. An image in them would make the
// reviewer's machine call any server, revealing their IP and when they opened the PR.
const BREAK = "​";
/** Any tag not known to be safe. Autolinks like <https://x> have a scheme and stay. */
const UNSAFE_TAG =
  /<(?=[a-z])(?!(?:a|b|blockquote|br|code|del|details|div|em|h[1-6]|hr|i|kbd|li|ol|p|pre|s|span|strong|sub|summary|sup|table|tbody|td|th|thead|tr|ul)[\s/>])(?![a-z][a-z0-9+.-]*:)/giu;

/**
 * Stops Markdown and HTML from loading anything remote, by making them plain text.
 * The invisible character also leaves code blocks looking the same. For display only: never save the result.
 * shortcut: `![a](url)` shows as "!" and a link, and `<img src="url">` as text, until Markdown can turn images off.
 */
export function withoutRemoteContent(markdown: string): string {
  return markdown.replaceAll("![", `!${BREAK}[`).replace(UNSAFE_TAG, `<${BREAK}`);
}
