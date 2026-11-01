// @vitest-environment node
// What the Questions form on #/live (Questions.tsx) sends to live.questions.ask (sweep1-live-8):
// anonymous by default (F22), private: true once "Only the professor sees it" is ticked (F30.5).
// No DOM here, so the test calls the component as a function with a stand-in useState, finds the
// form's checkboxes, textarea and submit handler in the elements it returns, and calls them the
// way a tap would. Each call re-renders, so the next handler sees the new state.
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Questions from "./Questions";

const state = vi.hoisted(() => ({
  slots: [] as unknown[], // useState values, in hook order
  next: 0,
  sent: [] as [string, unknown][], // mutations the form ran, with their args
}));

vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  const useState = (init: unknown) => {
    const i = state.next++;
    if (!(i in state.slots)) state.slots[i] = typeof init === "function" ? (init as () => unknown)() : init;
    const set = (value: unknown) => {
      state.slots[i] = typeof value === "function" ? (value as (old: unknown) => unknown)(state.slots[i]) : value;
    };
    return [state.slots[i], set];
  };
  return { ...real, useState, default: { ...real, useState } };
});
vi.mock("convex/react", () => ({
  useQuery: () => [],
  useMutation: (ref: FunctionReference<"mutation">) => async (args: unknown) => {
    state.sent.push([getFunctionName(ref), args]);
    return null;
  },
}));
vi.mock("../../blocks/auth", () => ({ useGoogleUser: () => ({ user: { name: "Sample student 1" } }), StudentSignIn: () => null }));

beforeEach(() => {
  state.slots = [];
  state.sent.length = 0;
});

type El = ReactElement<Record<string, unknown> & { children?: ReactNode }>;

function render(): El {
  state.next = 0;
  return Questions({ index: 3 }) as El;
}

// Every element in the tree the component returned, depth first.
function all(node: ReactNode, out: El[] = []): El[] {
  if (Array.isArray(node)) for (const n of node) all(n, out);
  else if (isValidElement(node)) {
    const el = node as El;
    out.push(el);
    all(el.props.children, out);
  }
  return out;
}
const text = (node: ReactNode): string => (Array.isArray(node) ? node.map(text).join("") : typeof node === "string" ? node : isValidElement(node) ? text((node as El).props.children) : "");

// The checkbox inside the label with these words.
function box(words: string) {
  const label = all(render()).find((el) => el.type === "label" && text(el.props.children).includes(words));
  if (!label) throw new Error(`no label "${words}"`);
  const input = all(label.props.children).find((el) => el.type === "input");
  if (!input) throw new Error(`no checkbox in "${words}"`);
  return input.props as { checked: boolean; onChange: (e: { target: { checked: boolean } }) => void };
}
function type(words: string) {
  const area = all(render()).find((el) => el.type === "textarea")!;
  (area.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: words } });
}
async function submit() {
  const form = all(render()).find((el) => el.type === "form")!;
  await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({ preventDefault: () => {} });
}
const asked = () => state.sent.filter(([name]) => name === "live/questions:ask").map(([, args]) => args);

describe("#/live Questions form sends", () => {
  it("F22 anonymous: true and private: false when nothing is ticked", async () => {
    expect(box("Post anonymously").checked).toBe(true);
    expect(box("Only the professor").checked).toBe(false);
    type("What does O(n) mean?");
    await submit();
    expect(asked()).toEqual([{ channel: "gdg", index: 3, text: "What does O(n) mean?", anonymous: true, private: false }]);
  });

  it("F30.5 private: true once 'Only the professor sees it' is ticked", async () => {
    box("Only the professor").onChange({ target: { checked: true } });
    expect(box("Only the professor").checked).toBe(true);
    // D12 (f): the AI topic sort still reads private texts, never names, and the form says so.
    expect(text(render().props.children)).toContain("The professor’s AI tool can read the words to sort questions by topic. It never gets your name.");
    type("Slide 4 lost me");
    await submit();
    expect(asked()).toEqual([{ channel: "gdg", index: 3, text: "Slide 4 lost me", anonymous: true, private: true }]);
  });

  it("anonymous: false once 'Post anonymously' is unticked", async () => {
    box("Post anonymously").onChange({ target: { checked: false } });
    type("Can you zoom in?");
    await submit();
    expect(asked()).toEqual([{ channel: "gdg", index: 3, text: "Can you zoom in?", anonymous: false, private: false }]);
  });
});
