// #/admin's note after pairing a door iPad ("A-210 door is paired."), and the iPad it names
// (Admin.tsx PairDevice). The note shows only while that iPad is still in the Door iPads list, so
// it goes away when someone unpairs it.
import type { Id } from "../../convex/_generated/dataModel";

export type Paired = { device: Id<"devices">; text: string };

// True while `devices` (staff.devices) still lists the paired iPad, or hasn't loaded yet.
export function stillPaired(done: Paired, devices: { _id: Id<"devices"> }[] | undefined) {
  return devices === undefined || devices.some((d) => d._id === done.device);
}
