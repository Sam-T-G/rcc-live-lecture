// #/admin: who may use the professor pages and the door scanner, and the door iPads.
//   Admins: Add someone and People (everyone with a role; the permanent admins in ADMIN_EMAILS
//     have no role picker or Remove), Pair a door iPad and Door iPads, and Changes (the last 50).
//   Professors: Pair a door iPad and Door iPads, and "Only admins can add people."
//   Everyone else: "Admins only." with the email they're signed in with, or the sign-in.
// The server checks every call (convex/staff.ts lists each function and who may call it).
// The page: the staff bar (StaffBar: the title, who is signed in), then the main column (Add
// someone, People) and the side column (Pair a door iPad, the page's one raised card, then Door
// iPads and Changes). Lists and the People table sit in wells; Remove and Unpair ask in a box that
// rises over their row.
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { SignedInAs } from "../blocks/auth";
import { Button, ConfirmButton, EmptyState, Field, Icon, Segmented, StateChip, type Choice } from "../blocks/kit";
import { ErrorBoundary, Screen, Status } from "../blocks/ui";
import { NotStaff, SignInChecking, SignInEnding, SignInRefused, SignInScreen, StaffBar, useStaff, type StaffMe } from "../teams/checkin/prof";
import { stillPaired, type Paired } from "./paired";
import { why } from "../teams/checkin/util";
import "./admin.css";

type StaffRole = "professor" | "scanner" | "admin";
const ROLES: Choice<StaffRole>[] = [
  { value: "professor", label: "Professor" },
  { value: "scanner", label: "Scanner" },
  { value: "admin", label: "Admin" },
];
const A_ROLE: Record<StaffRole, string> = { professor: "a professor", scanner: "a scanner", admin: "an admin" };

// A date and time like "Oct 31, 2:41 PM".
const when = (ms: number) => new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function Admin() {
  const me = useStaff();
  if (me?.role === "admin" || me?.role === "professor")
    return (
      <>
        <StaffBar title="Admin" />
        <SignInEnding bar />
        {me.role === "admin" ? <AdminView /> : <ProfessorView />}
      </>
    );
  return <SignInScreen title="Admin">{me === undefined ? <SignInChecking /> : <AdminsOnly me={me} />}</SignInScreen>;
}

// Signed out, a scanner, a student, or a sign-in that can't hold a role. A sign-in the page
// doesn't open for gets the lock glyph before the reason (SignInRefused).
function AdminsOnly({ me }: { me: StaffMe }) {
  const reason = (
    <>
      <p>Admins only.</p>
      {me && me.canHoldRole ? <SignedInAs /> : <NotStaff me={me} />}
    </>
  );
  return me === null ? reason : <SignInRefused>{reason}</SignInRefused>;
}

// The page under the staff bar (Admin draws the bar, with who is signed in).
export function AdminView() {
  return (
    <div className="staff-page">
      <Screen wide>
        <div className="desk admin">
          <div className="admin__main">
            <ErrorBoundary label="The Add someone form">
              <AddPerson />
            </ErrorBoundary>
            <ErrorBoundary label="The staff list">
              <People />
            </ErrorBoundary>
          </div>
          <div className="admin__side">
            <ErrorBoundary label="The pairing form">
              <PairDevice />
            </ErrorBoundary>
            <ErrorBoundary label="The door iPad list">
              <Devices />
            </ErrorBoundary>
            <ErrorBoundary label="The list of changes">
              <Changes />
            </ErrorBoundary>
          </div>
        </div>
      </Screen>
    </div>
  );
}

// A professor's page: Pair a door iPad in the side column, Door iPads in the main one.
export function ProfessorView() {
  return (
    <div className="staff-page">
      <Screen wide>
        <div className="desk admin admin--prof">
          <div className="admin__side">
            <ErrorBoundary label="The pairing form">
              <PairDevice />
            </ErrorBoundary>
          </div>
          <div className="admin__main">
            <p className="notice notice--plain admin__note">
              <Icon name="lock" />
              <span>Only admins can add people.</span>
            </p>
            <ErrorBoundary label="The door iPad list">
              <Devices />
            </ErrorBoundary>
          </div>
        </div>
      </Screen>
    </div>
  );
}

// ---------- People (admins) ----------

export function AddPerson() {
  const add = useMutation(api.staff.add);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("professor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const typed = email.trim().toLowerCase();
    setBusy(true);
    setError("");
    setDone("");
    try {
      await add({ email: typed, role });
      setDone(`${typed} is ${A_ROLE[role]} now.`);
      setEmail("");
    } catch (err) {
      setError(why(err));
    } finally {
      setBusy(false);
    }
  }

  // A section on the page: the email, the role as text options, the roles' sentence, then Add (an
  // outline button, so Pair is the page's one filled button).
  return (
    <section className="admin-sec">
      <h2>Add someone</h2>
      <form onSubmit={submit} className="admin-add">
        <Field label="Email" hint="The Google account they sign in with.">
          {(f) => <input {...f} className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />}
        </Field>
        <Segmented label="Role" options={ROLES} value={role} onChange={setRole} />
        <p className="muted">
          Professors open every professor page and pair door iPads. Scanners only scan passes at the door. Admins can also add, change and
          remove people here.
        </p>
        {error && <Status kind="error">{error}</Status>}
        <Button type="submit" variant="secondary" busy={busy}>
          Add
        </Button>
        {done && (
          <p className="hang hang--in admin__done" role="status">
            <Icon name="check" />
            <span>{done}</span>
          </p>
        )}
      </form>
    </section>
  );
}

type Person = FunctionReturnType<typeof api.staff.people>[number];

// The staff list: a table in a well with a raised head; emails cut short with the whole one in
// the title.
function People() {
  const people = useQuery(api.staff.people, {});
  const [error, setError] = useState("");
  return (
    <section className="admin-sec">
      <h2>People</h2>
      {people === undefined ? (
        <div className="state state--inline admin-empty">
          <Status kind="loading">Loading the staff list…</Status>
        </div>
      ) : people.length === 0 ? (
        <div className="state state--inline admin-empty">
          <EmptyState title="No one has a role yet">Add someone above.</EmptyState>
        </div>
      ) : (
        <div className="table-scroll admin-people">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th className="admin-people__role">Role</th>
                <th>Added by</th>
                <th className="admin-people__at">Added</th>
                <th className="admin-people__act">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <PersonRow key={p.email} p={p} onError={setError} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <Status kind="error">{error}</Status>}
      {people?.some((p) => p.locked) && (
        <p className="muted admin__note">You can't change or remove a permanent admin here: they're set in the server settings (ADMIN_EMAILS).</p>
      )}
    </section>
  );
}

function PersonRow({ p, onError }: { p: Person; onError: (message: string) => void }) {
  const setRole = useMutation(api.staff.setRole);
  const remove = useMutation(api.staff.remove);
  // The role picked while the change saves, so the picker doesn't jump back to the old one first.
  const [saving, setSaving] = useState<StaffRole | null>(null);

  async function change(role: StaffRole) {
    setSaving(role);
    onError("");
    try {
      await setRole({ email: p.email, role });
    } catch (e) {
      onError(why(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <tr>
      <td className="admin__email">
        <span className="trunc" title={p.email}>
          {p.email}
        </span>
      </td>
      <td>
        {p.locked ? (
          <span className="admin__locked">
            Admin{" "}
            <StateChip tone="neutral" glyph="lock">
              Permanent
            </StateChip>
          </span>
        ) : (
          <select
            aria-label={`Role for ${p.email}`}
            value={saving ?? p.role}
            disabled={saving !== null}
            onChange={(e) => void change(e.target.value as StaffRole)}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="admin__email">
        <span className="trunc" title={p.addedBy}>
          {p.addedBy}
        </span>
      </td>
      <td className="admin__when">{p.at === null ? "" : when(p.at)}</td>
      <td className="admin__act">
        {!p.locked && (
          <ConfirmButton question={`Remove ${p.email} from the staff list?`} confirm="Remove" onConfirm={() => remove({ email: p.email })}>
            Remove
          </ConfirmButton>
        )}
      </td>
    </tr>
  );
}

// The last 50 changes, newest first, as rows in a well: the sentence, its time under it.
function Changes() {
  const changes = useQuery(api.staff.changes, {});
  return (
    <section className="admin-sec">
      <h2>Changes</h2>
      {changes === undefined ? (
        <div className="state state--inline admin-empty">
          <Status kind="loading">Loading the changes…</Status>
        </div>
      ) : changes.length === 0 ? (
        <div className="state state--inline admin-empty">
          <EmptyState title="No changes yet" />
        </div>
      ) : (
        <>
          <p className="muted admin__note">The last {changes.length}, newest first.</p>
          <ul className="ruled ruled--well admin-changes">
            {changes.map((c) => (
              <li key={c._id} className="ruled__row">
                <span className="admin__email">{c.text}</span> <span className="muted">{when(c.at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ---------- Door iPads (professors and admins) ----------

function PairDevice() {
  const approve = useMutation(api.staff.approvePairing);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Paired | null>(null);
  const devices = useQuery(api.staff.devices, {});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = label.trim().replace(/\s+/g, " ");
    setBusy(true);
    setError("");
    setDone(null);
    try {
      const device = await approve({ code, label: name });
      setDone({ device, text: `${name} is paired. That iPad shows the pass scanner now.` });
      setCode("");
      setLabel("");
    } catch (err) {
      setError(why(err));
    } finally {
      setBusy(false);
    }
  }

  // The page's one raised card: the steps, the code and the name, then Pair.
  return (
    <section className="focal admin-pair">
      <h2>Pair a door iPad</h2>
      <p className="muted">On the iPad at the door, open Home and tap Check-in kiosk to get a pairing code. Each code works for 10 minutes.</p>
      <form onSubmit={submit} className="admin-pair__form">
        <Field label="Code on the iPad">
          {(f) => (
            <input
              {...f}
              className="input input--code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              required
            />
          )}
        </Field>
        <Field label="Name" hint="Where the iPad is, like A-210 door.">
          {(f) => <input {...f} className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} autoComplete="off" required />}
        </Field>
        {error && <Status kind="error">{error}</Status>}
        <Button type="submit" busy={busy}>
          Pair
        </Button>
        {done && stillPaired(done, devices) && (
          <p className="hang hang--in admin__done" role="status">
            <Icon name="check" />
            <span>{done.text}</span>
          </p>
        )}
      </form>
    </section>
  );
}

type Device = FunctionReturnType<typeof api.staff.devices>[number];

// The paired iPads as rows in a well: the name, who paired it and its last scan, then Unpair.
function Devices() {
  const devices = useQuery(api.staff.devices, {});
  return (
    <section className="admin-sec">
      <h2>Door iPads</h2>
      {devices === undefined ? (
        <div className="state state--inline admin-empty">
          <Status kind="loading">Loading the door iPads…</Status>
        </div>
      ) : devices.length === 0 ? (
        <div className="state state--inline admin-empty">
          <EmptyState title="No door iPads yet">Pair one with the code that Check-in kiosk shows on the iPad.</EmptyState>
        </div>
      ) : (
        <ul className="ruled ruled--well admin-devices">
          {devices.map((d) => (
            <DeviceRow key={d._id} d={d} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DeviceRow({ d }: { d: Device }) {
  const unpair = useMutation(api.staff.unpair);
  return (
    <li className="ruled__row admin__device">
      <div>
        <p className="admin__label">{d.label}</p>
        <p className="muted admin__email">
          Paired by {d.pairedBy}, <span className="nowrap">{when(d.pairedAt)}.</span>{" "}
          {d.lastUsedAt === null ? (
            "No scans yet."
          ) : (
            <>
              Last scan <span className="nowrap">{when(d.lastUsedAt)}.</span>
            </>
          )}
        </p>
      </div>
      <span className="admin__act">
        <ConfirmButton
          question={`Unpair ${d.label}? That iPad stops scanning right away and shows a new pairing code.`}
          confirm="Unpair"
          onConfirm={() => unpair({ device: d._id })}
        >
          Unpair
        </ConfirmButton>
      </span>
    </li>
  );
}
