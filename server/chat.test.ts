import type { GraphDoc } from "@coldtea/pr-lens-schema";
import { describe, expect, it } from "vitest";
import { graphContext } from "./chat";

const graph = {
  lanes: [{ id: "api", label: "API" }, { id: "data", label: "Data" }],
  nodes: [
    { id: "route", label: "GET /users", kind: "route", delta: "modified", lane: "api", files: [{ path: "src/a.ts" }, { path: "src/b.ts" }] },
    { id: "cache", label: "User cache", kind: "cache", delta: "added", lane: "data", files: [] },
  ],
  flows: [
    {
      id: "lookup",
      title: "Look up a user",
      messages: [
        { id: "get", from: "route", to: "cache", label: "get(id)", delta: "added" },
        { id: "db", from: "cache", to: "ghost", label: "miss", delta: "added" },
      ],
    },
  ],
  dataModel: {
    tables: [
      {
        label: "users",
        delta: "modified",
        columns: [
          { name: "id", type: "uuid", delta: "unchanged" },
          { name: "email", type: "text", previousType: "varchar", delta: "modified" },
          { name: "seen", type: "timestamp", delta: "added" },
        ],
      },
      { label: "sessions", delta: "unchanged", columns: [{ name: "id", type: "uuid", delta: "unchanged" }] },
    ],
  },
  walkthrough: {
    steps: [
      { heading: "A cache", body: "The route asks the cache.", detail: { text: "See the route." } },
      { heading: "The lookup", body: "One call." },
    ],
  },
} as unknown as GraphDoc;

describe("the chat context's diagrams", () => {
  it("lists the walkthrough, the parts by lane, each flow and the changed columns", () => {
    expect(graphContext(graph)).toEqual([
      "",
      "### Walkthrough",
      "1. A cache: The route asks the cache. See the route.",
      "2. The lookup: One call.",
      "",
      "### Diagram parts (architecture lanes; delta in brackets)",
      "- API",
      "  - GET /users (route) [modified]: src/a.ts, src/b.ts",
      "- Data",
      "  - User cache (cache) [added]",
      "",
      "### Flow: Look up a user",
      "1. GET /users -> User cache: get(id) [added]",
      "2. User cache -> ghost: miss [added]",
      "",
      "### Data model",
      "- users [modified]: email varchar -> text [modified], seen timestamp [added]",
      "- sessions [unchanged]",
    ]);
  });

  it("leaves out the walkthrough and data model when the document has none", () => {
    const bare = { ...graph, walkthrough: undefined, dataModel: undefined, flows: [] } as unknown as GraphDoc;
    expect(graphContext(bare)).toEqual([
      "",
      "### Walkthrough",
      "",
      "### Diagram parts (architecture lanes; delta in brackets)",
      "- API",
      "  - GET /users (route) [modified]: src/a.ts, src/b.ts",
      "- Data",
      "  - User cache (cache) [added]",
    ]);
  });
});
