// Who may use the professor pages and the door scanner, on the client. The server checks every
// call (convex/checkin/prof.ts, convex/staff.ts); these parts only pick what a page shows. No page
// sends a key: the server reads who is calling from their sign-in.
//   useStaff()   the signed-in person: undefined while loading, null when signed out, else
//                { email, role, canHoldRole } from api.staff.me (role: "admin", "professor",
//                "scanner" or null).
//   <StaffGate title="Live quiz">...</StaffGate>   the page, for professors and admins, under a
//                "Signed in as" line with Sign out. Anyone else sees how to sign in, or why their
//                sign-in doesn't open it.
//   <SignInEnding />   for the 5 minutes before a Google sign-in ends, its end time and Google's
//                button pinned to the bottom of the page (StaffGate and #/admin show it; #/live
//                and #/checkin/student show it with line={STUDENT_ENDING}).
//   <DoorGate>, <PairScreen>, readDeviceToken() and newDeviceToken()   the door iPad's gate for
//                #/checkin/kiosk, in door.tsx; this file re-exports them, so imports from
//                "./prof" keep working.
import { type ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { GoogleButton, SignedInAs, SignInButton, useGoogleUser } from "../../blocks/auth";
import { Banner, BannerStack, Button } from "../../blocks/kit";
import { Screen, Status } from "../../blocks/ui";
import { clock } from "./util";

export { DoorGate, newDeviceToken, PairScreen, readDeviceToken } from "./door";

export type StaffMe = FunctionReturnType<typeof api.staff.me>;
export type Role = NonNullable<StaffMe>["role"];

// Professors and admins: who the professor pages open for (door.tsx asks the same).
export const isProfRole = (role: Role | undefined) => role === "professor" || role === "admin";

// The door iPad's page (#/checkin/kiosk) under its title, for what DoorGate (door.tsx) shows
// before the scanner opens. Home links the page by this title (Home.test.ts reads it here).
export function KioskScreen({ children }: { children: ReactNode }) {
  return (
    <Screen title="Check-in kiosk" wide>
      {children}
    </Screen>
  );
}

// The signed-in person as the server's staff checks see them. It waits for Convex to accept the
// sign-in first, so a page never shows the signed-out screen for a moment before the real one.
export function useStaff(): StaffMe | undefined {
  const { isLoading } = useConvexAuth();
  const me = useQuery(api.staff.me, isLoading ? "skip" : {});
  return isLoading ? undefined : me;
}

// True for a Google ID token whose email Google hasn't verified. The server gives such a sign-in
// no role (provenEmail in convex/checkin/prof.ts), and this is the same token Convex was sent.
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
function isUnverifiedGoogle(token: string | undefined) {
  if (!token) return false;
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return GOOGLE_ISSUERS.includes(p.iss) && p.email_verified !== true;
  } catch {
    return false;
  }
}

// What a staff page shows to someone it doesn't open for, and how they get in. A sign-in that
// can't hold a role gets Sign out, which brings back the Google button: Convex keeps using the
// token it has until it refreshes it, so a new sign-in made on top of the old one wouldn't reach
// the server before a reload. A Google account is told its email isn't verified; a typed
// sign-in (on prod, or on dev without a test email) is told to use Google.
export function NotStaff({ me }: { me: StaffMe }) {
  const { user, signOut } = useGoogleUser();
  if (me === null)
    return (
      <>
        <p>Sign in with the Google account your admin added.</p>
        <SignInButton />
      </>
    );
  if (!me.canHoldRole && isUnverifiedGoogle(user?.token))
    return (
      <>
        <p>Google hasn't verified {me.email}, so the app can't check that it's yours. Verify the email in your Google account, then sign out and sign in again.</p>
        <p>
          <Button variant="secondary" onClick={signOut}>Sign out</Button>
        </p>
      </>
    );
  if (!me.canHoldRole)
    return (
      <>
        <p>Staff sign in with Google, so the app can check that {me.email} is yours. Sign out, then sign in with Google.</p>
        <p>
          <Button variant="secondary" onClick={signOut}>Sign out</Button>
        </p>
      </>
    );
  return (
    <>
      <p>
        {me.role === "scanner"
          ? `${me.email} is on the staff list as a scanner, so you can scan passes at the door but can't open this page. Ask an admin to make you a professor on #/admin.`
          : `${me.email} isn't on the staff list. Ask an admin to add you on #/admin.`}
      </p>
      <p>
        <Button variant="secondary" onClick={signOut}>Sign out</Button>
      </p>
    </>
  );
}

// A professor page: its children for professors and admins, the sign-in or the reason for
// everyone else, under the page's title. An open page starts with who is signed in and Sign out:
// the sign-in stays in the browser (and Chrome renews it with no click), so a professor on a
// shared lectern PC signs out before leaving, or the next person there opens the page as them.
export function StaffGate({ title, children }: { title: string; children: ReactNode }) {
  const me = useStaff();
  const { user } = useGoogleUser();
  if (me && isProfRole(me.role))
    return (
      <>
        <SignInEnding />
        {user && (
          <div className="page page--wide" style={{ paddingBlockEnd: 0 }}>
            <SignedInAs />
          </div>
        )}
        {children}
      </>
    );
  return (
    <Screen title={title} wide>
      {me === undefined ? <Status kind="loading">Checking who is signed in…</Status> : <NotStaff me={me} />}
    </Screen>
  );
}

// A Google sign-in ends a minute before its ID token runs out (an hour after sign-in). Chrome
// renews it with no click, but Safari and Firefox show Google's One Tap card, which needs one, so
// for the last 5 minutes this says when the sign-in ends and shows Google's button, which works in
// every browser. Signing in again keeps the page open; nothing shows once the new sign-in comes.
// Student pages (#/live, #/checkin/student) pass their own `line` (STUDENT_ENDING), since the
// page stays open for them but signs them out.
export const STUDENT_ENDING = "Sign in with Google again before then, or this page signs you out.";
export function SignInEnding({ line = "Sign in with Google again before then to keep this page open." }: { line?: string }) {
  const { endsAt } = useGoogleUser();
  if (endsAt == null) return null;
  return (
    <BannerStack>
      <Banner tone="warn" title={`Your sign-in ends at ${clock(endsAt)}.`} action={<GoogleButton />}>
        {line}
      </Banner>
    </BannerStack>
  );
}

