// Check-in team: #/checkin/kiosk (the laptop or TV at the door) and #/checkin/join (what a
// phone opens after scanning). Registered in src/pages/index.ts already; build here.
import { useRoute } from "../../blocks/router";
import { Screen, Todo } from "../../blocks/ui";

export default function CheckinPage() {
  const [, part = "join"] = useRoute();
  if (part === "kiosk")
    return (
      <Screen title="Check in" wide>
        <Todo team="Check-in">A big QR code that changes every 20 seconds, and the list of who checked in.</Todo>
      </Screen>
    );
  return (
    <Screen title="Check in">
      <Todo team="Check-in">Sign in with Google, then one button that checks you in, using your location once.</Todo>
    </Screen>
  );
}
