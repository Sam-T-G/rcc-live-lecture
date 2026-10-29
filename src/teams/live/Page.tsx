// Live slides team: #/live, the phone view of the slide the professor is on. Registered in
// src/pages/index.ts already; build here.
import { Screen, Todo } from "../../blocks/ui";

export default function LivePage() {
  return (
    <Screen title="Live slides">
      <Todo team="Live slides">The current slide, live, with an “I’m lost” button under it.</Todo>
    </Screen>
  );
}
