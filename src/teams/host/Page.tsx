// Professor view team: #/host, the screen the professor glances at while teaching. Hosts
// only. Registered in src/pages/index.ts already; build here.
import { Screen, Todo } from "../../blocks/ui";

export default function HostPage() {
  return (
    <Screen title="Professor view" wide>
      <Todo team="Professor view">The current slide, big, with how many checked in and how many are lost on it.</Todo>
    </Screen>
  );
}
