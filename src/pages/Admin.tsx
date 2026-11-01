// #/admin: who may use the professor pages and the door scanner, and the door iPads.
//   Admins: Add someone and People (everyone with a role; the permanent admins in ADMIN_EMAILS
//     have no role picker or Remove), Pair a door iPad and Door iPads, and Changes (the last 50).
//   Professors: Pair a door iPad and Door iPads, and "Only admins can add people."
//   Everyone else: "Admins only." with the email they're signed in with, or the sign-in.
// The server checks every call (convex/staff.ts lists each function and who may call it).
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { SignedInAs } from "../blocks/auth";
import { Badge, Button, ConfirmButton, EmptyState, Field, Segmented, type Choice } from "../blocks/kit";
import { Card, ErrorBoundary, Screen, Status } from "../blocks/ui";
import { NotStaff, SignInEnding, useStaff, type StaffMe } from "../teams/checkin/prof";
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
        <SignInEnding />
        {me.role === "admin" ? <AdminView /> : <ProfessorView />}
      </>
    );
  return (
    <Screen title="Admin" wide>
      {me === undefined ? <Status kind="loading">Checking who is signed in…</Status> : <AdminsOnly me={me} />}
    </Screen>
  );
}

// Signed out, a scanner, a student, or a sign-in that can't hold a role.
function AdminsOnly({ me }: { me: StaffMe }) {
  return (
    <>
      <p>Admins only.</p>
      {me && me.canHoldRole ? <SignedInAs /> : <NotStaff me={me} />}
    </>
  );
}

function AdminView() {
  return (
    <Screen title="Admin" wide>
      <SignedInAs />
      <div className="admin">
        <div>
          <ErrorBoundary label="Add someone">
            <AddPerson />
          </ErrorBoundary>
          <ErrorBoundary label="People">
            <People />
          </ErrorBoundary>
        </div>
        <div>
          <ErrorBoundary label="Pair a door iPad">
            <PairDevice />
          </ErrorBoundary>
          <ErrorBoundary label="Door iPads">
            <Devices />
          </ErrorBoundary>
          <ErrorBoundary label="Changes">
            <Changes />
          </ErrorBoundary>
        </div>
      </div>
    </Screen>
  );
}

function ProfessorView() {
  return (
    <Screen title="Admin" wide>
      <SignedInAs />
      <p>Only admins can add people.</p>
      <div className="admin">
        <div>
          <ErrorBoundary label="Pair a door iPad">
            <PairDevice />
          </ErrorBoundary>
        </div>
        <div>
          <ErrorBoundary label="Door iPads">
            <Devices />
          </ErrorBoundary>
        </div>
      </div>
    </Screen>
  );
}

// ---------- People (admins) ----------

function AddPerson() {
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

  return (
    <Card title="Add someone">
      <form onSubmit={submit}>
        <Field label="Email" hint="The Google account they sign in with." error={error || undefined}>
          {(f) => <input {...f} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />}
        </Field>
        <Segmented label="Role" options={ROLES} value={role} onChange={setRole} />
        <p className="muted">
          Professors open every professor page and pair door iPads. Scanners only scan passes at the door. Admins can also add, change and
          remove people here.
        </p>
        <Button type="submit" busy={busy}>
          Add
        </Button>
        {done && (
          <p className="muted" role="status">
            {done}
          </p>
        )}
      </form>
    </Card>
  );
}

type Person = FunctionReturnType<typeof api.staff.people>[number];

function People() {
  const people = useQuery(api.staff.people, {});
  const [error, setError] = useState("");
  return (
    <Card title="People">
      {people === undefined ? (
        <Status kind="loading">Loading the staff list…</Status>
      ) : people.length === 0 ? (
        <EmptyState title="No one has a role yet">Add someone above.</EmptyState>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Added by</th>
                <th>Added</th>
                <th>
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
        <p className="muted">You can't change or remove a permanent admin here: they're set in the server settings (ADMIN_EMAILS).</p>
      )}
    </Card>
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
      <td className="admin__email">{p.email}</td>
      <td>
        {p.locked ? (
          <span className="admin__locked">
            Admin <Badge>Permanent</Badge>
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
      <td className="admin__email">{p.addedBy}</td>
      <td>{p.at === null ? "" : when(p.at)}</td>
      <td>
        {!p.locked && (
          <ConfirmButton question={`Remove ${p.email} from the staff list?`} confirm="Remove" onConfirm={() => remove({ email: p.email })}>
            Remove
          </ConfirmButton>
        )}
      </td>
    </tr>
  );
}

function Changes() {
  const changes = useQuery(api.staff.changes, {});
  return (
    <Card title="Changes">
      {changes === undefined ? (
        <Status kind="loading">Loading the changes…</Status>
      ) : changes.length === 0 ? (
        <EmptyState title="No changes yet" />
      ) : (
        <>
          <p className="muted">The last {changes.length}, newest first.</p>
          <ul className="list">
            {changes.map((c) => (
              <li key={c._id}>
                <span className="admin__email">{c.text}</span> <span className="muted">{when(c.at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
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

  return (
    <Card title="Pair a door iPad">
      <p className="muted">Open the Kiosk page on the iPad at the door to get a 6-digit code. Each code works for 10 minutes.</p>
      <form onSubmit={submit}>
        <Field label="Code on the iPad">
          {(f) => (
            <input {...f} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="off" maxLength={11} required />
          )}
        </Field>
        <Field label="Name" hint="Where the iPad is, like A-210 door.">
          {(f) => <input {...f} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} autoComplete="off" required />}
        </Field>
        {error && <Status kind="error">{error}</Status>}
        <Button type="submit" busy={busy}>
          Pair
        </Button>
        {done && stillPaired(done, devices) && (
          <p className="muted" role="status">
            {done.text}
          </p>
        )}
      </form>
    </Card>
  );
}

type Device = FunctionReturnType<typeof api.staff.devices>[number];

function Devices() {
  const devices = useQuery(api.staff.devices, {});
  return (
    <Card title="Door iPads">
      {devices === undefined ? (
        <Status kind="loading">Loading the door iPads…</Status>
      ) : devices.length === 0 ? (
        <EmptyState title="No door iPads yet">Pair one with the code on its Kiosk page.</EmptyState>
      ) : (
        <ul className="list">
          {devices.map((d) => (
            <DeviceRow key={d._id} d={d} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function DeviceRow({ d }: { d: Device }) {
  const unpair = useMutation(api.staff.unpair);
  return (
    <li className="admin__device">
      <div>
        <p className="admin__label">{d.label}</p>
        <p className="muted admin__email">
          Paired by {d.pairedBy}, {when(d.pairedAt)}. {d.lastUsedAt === null ? "No scans yet." : `Last scan ${when(d.lastUsedAt)}.`}
        </p>
      </div>
      <ConfirmButton
        question={`Unpair ${d.label}? That iPad stops scanning right away and shows a new pairing code.`}
        confirm="Unpair"
        onConfirm={() => unpair({ device: d._id })}
      >
        Unpair
      </ConfirmButton>
    </li>
  );
}
