// Check-in team: one page for each #/checkin/<part>.
//   student (also join, and #/checkin alone): the student types a name and email, and the phone
//     shows their QR pass (Student.tsx).
//   teacher: behind the professor key. The laptop camera reads passes, the page lists who has
//     checked in, and the professor sets when class starts and downloads attendance (Teacher.tsx).
//   kiosk: behind the professor key. The iPad at the door scans passes with its front camera
//     (Kiosk.tsx).
//   quiz: behind the professor key. The professor asks the room a quiz question or a vote (Quiz.tsx).
//   stage: the deck full screen for the projector, with the check-in QR, the count and the open
//     quiz on top (Stage.tsx).
// Any other part, or any part after one of these, shows "No page at #/checkin/<parts>".
import "./checkin.css";
import { Link, useRoute } from "../../blocks/router";
import { Screen } from "../../blocks/ui";
import Kiosk from "./Kiosk";
import Stage from "./Stage";
import { Professor } from "./Quiz";
import { Student } from "./Student";
import { Teacher } from "./Teacher";

export default function CheckinPage() {
  const [, ...rest] = useRoute();
  const [part = "student"] = rest;
  if (rest.length <= 1)
    switch (part) {
      case "student":
      case "join":
        return <Student />;
      case "teacher":
        return <Teacher />;
      case "kiosk":
        return <Kiosk />;
      case "quiz":
        return <Professor />;
      case "stage":
        return <Stage />;
    }
  return (
    <Screen title={`No page at #/checkin/${rest.join("/")}`}>
      <p><Link to="">Go home</Link></p>
    </Screen>
  );
}
