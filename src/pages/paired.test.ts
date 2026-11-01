// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { stillPaired } from "./paired";

const d1 = "d1" as Id<"devices">;
const d2 = "d2" as Id<"devices">;
const done = { device: d1, text: "A-210 door is paired. That iPad shows the pass scanner now." };

describe("#/admin note after pairing a door iPad", () => {
  it("shows while Door iPads lists that iPad, and while the list loads", () => {
    expect(stillPaired(done, [{ _id: d2 }, { _id: d1 }])).toBe(true);
    expect(stillPaired(done, undefined)).toBe(true);
  });
  it("goes away once that iPad is unpaired", () => {
    expect(stillPaired(done, [{ _id: d2 }])).toBe(false);
    expect(stillPaired(done, [])).toBe(false);
  });
});
