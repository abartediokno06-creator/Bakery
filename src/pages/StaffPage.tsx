import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Trash2, UserCheck, UserPlus, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useBranch } from "@/context/BranchContext";
import { supabase, toErrorMessage } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/types/domain";

type RoleRow = { branch_id: string; role: AppRole };
type Staff = {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_super_admin: boolean;
  last_sign_in_at: string | null;
  roles: RoleRow[];
};

const ROLE_LABEL: Record<AppRole, string> = { cashier: "Cashier", branch_manager: "Manager", baker: "Baker" };
const ROLE_HELP: Record<AppRole, string> = {
  cashier: "Sells, opens and closes the drawer, takes special orders.",
  branch_manager: "Everything a cashier does, plus voids, stock changes and reports.",
  baker: "Records bakes and transfers. Cannot sell.",
};

/** 8 characters without look-alikes (0/O, 1/l/I) so it's easy to read out loud. */
function generatePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function StaffPage() {
  const { can, profile } = useBranch();
  const [editing, setEditing] = useState<string | "new" | null>(null);

  const staff = useQuery({
    queryKey: ["staff"],
    enabled: can("staff.manage"),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_staff");
      if (error) throw error;
      return data.map((s) => ({ ...s, roles: (Array.isArray(s.roles) ? s.roles : []) as RoleRow[] })) as Staff[];
    },
  });

  if (!can("staff.manage")) return <p className="p-8 text-muted">Only the owner can manage staff.</p>;

  const list = staff.data ?? [];
  const selected = editing && editing !== "new" ? list.find((s) => s.id === editing) ?? null : null;

  return (
    <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-[1fr_440px]">
      <Card className="min-w-0">
        <CardHeader>
          <div>
            <CardTitle>Staff</CardTitle>
            <p className="text-sm text-muted">Who can sign in, and at which branches.</p>
          </div>
          <Button onClick={() => setEditing("new")}>
            <UserPlus className="h-5 w-5" aria-hidden /> Add staff
          </Button>
        </CardHeader>
        {staff.isLoading ? (
          <p className="p-6 text-muted">Loading…</p>
        ) : staff.error ? (
          <p role="alert" className="p-6 text-danger">{toErrorMessage(staff.error)}</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((s) => (
              <StaffRow key={s.id} s={s} selected={editing === s.id} onClick={() => setEditing(s.id)} />
            ))}
          </ul>
        )}
      </Card>

      <div>
        {editing === "new" ? (
          <NewStaffForm onDone={(id) => setEditing(id)} onClose={() => setEditing(null)} />
        ) : selected ? (
          <EditStaff key={selected.id} s={selected} isSelf={selected.id === profile?.id} onClose={() => setEditing(null)} />
        ) : (
          <Card>
            <CardBody className="py-10 text-center text-muted">Pick a person to edit, or add new staff.</CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

function StaffRow({ s, selected, onClick }: { s: Staff; selected: boolean; onClick: () => void }) {
  const { branches } = useBranch();
  const names = new Map(branches.map((b) => [b.branch.id, b.branch.name]));
  return (
    <li>
      <button
        onClick={onClick}
        aria-current={selected}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-light/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
          selected && "bg-brand-light",
          !s.is_active && "opacity-70",
        )}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-sm font-extrabold text-white">
          {s.full_name.slice(0, 1).toUpperCase() || "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-ink">{s.full_name}</span>
            {s.is_super_admin && <Badge tone="brand">Owner</Badge>}
            {!s.is_active && <Badge tone="bad">Turned off</Badge>}
          </span>
          <span className="block truncate text-sm text-muted">{s.email}</span>
          <span className="mt-1 flex flex-wrap gap-1">
            {s.is_super_admin ? (
              <span className="text-xs text-muted">All branches</span>
            ) : s.roles.length === 0 ? (
              <span className="text-xs font-bold text-danger">No branch yet</span>
            ) : (
              s.roles.map((r) => (
                <span key={r.branch_id} className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-ink ring-1 ring-line">
                  {ROLE_LABEL[r.role]} · {names.get(r.branch_id) ?? "Unknown branch"}
                </span>
              ))
            )}
          </span>
        </span>
        <span className="hidden shrink-0 text-right text-xs text-muted sm:block">
          {s.last_sign_in_at ? (
            <>
              Last sign-in
              <br />
              {new Date(s.last_sign_in_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
            </>
          ) : (
            "Never signed in"
          )}
        </span>
      </button>
    </li>
  );
}

/** One row per branch: which branch and what the person does there. */
function RolesEditor({ roles, onChange }: { roles: RoleRow[]; onChange: (r: RoleRow[]) => void }) {
  const { branches } = useBranch();
  const used = new Set(roles.map((r) => r.branch_id));
  const free = branches.filter((b) => !used.has(b.branch.id));

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-ink">Branches and role</p>
      {roles.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_130px_auto] gap-2">
          <Select
            aria-label="Branch"
            value={r.branch_id}
            onChange={(e) => onChange(roles.map((x, j) => (j === i ? { ...x, branch_id: e.target.value } : x)))}
          >
            {branches
              .filter((b) => b.branch.id === r.branch_id || !used.has(b.branch.id))
              .map(({ branch }) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
          </Select>
          <Select
            aria-label="Role"
            value={r.role}
            onChange={(e) => onChange(roles.map((x, j) => (j === i ? { ...x, role: e.target.value as AppRole } : x)))}
          >
            {(Object.keys(ROLE_LABEL) as AppRole[]).map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </Select>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Remove this branch"
            disabled={roles.length === 1}
            onClick={() => onChange(roles.filter((_, j) => j !== i))}
            className="text-muted hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-5 w-5" aria-hidden />
          </Button>
        </div>
      ))}
      {free.length > 0 && (
        <Button size="sm" variant="secondary" onClick={() => onChange([...roles, { branch_id: free[0]!.branch.id, role: "cashier" }])}>
          <Plus className="h-4 w-4" aria-hidden /> Add another branch
        </Button>
      )}
      <ul className="space-y-0.5 pt-1 text-xs text-muted">
        {(Object.keys(ROLE_HELP) as AppRole[]).map((role) => (
          <li key={role}>
            <span className="font-bold">{ROLE_LABEL[role]}:</span> {ROLE_HELP[role]}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PasswordField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="block text-sm font-bold text-ink">
      {label}
      <span className="mt-1 flex gap-2">
        <Input required minLength={6} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" className="font-mono" />
        <Button variant="secondary" onClick={() => onChange(generatePassword())}>
          Make one
        </Button>
      </span>
      <span className="mt-1 block text-xs font-normal text-muted">At least 6 characters. Tell the person in private.</span>
    </label>
  );
}

function NewStaffForm({ onDone, onClose }: { onDone: (id: string) => void; onClose: () => void }) {
  const qc = useQueryClient();
  const { branches } = useBranch();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(generatePassword);
  const [roles, setRoles] = useState<RoleRow[]>(() => (branches[0] ? [{ branch_id: branches[0].branch.id, role: "cashier" }] : []));
  const [created, setCreated] = useState<{ id: string; email: string; password: string } | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("admin_create_staff", {
        p_email: email,
        p_password: password,
        p_full_name: name,
        p_roles: roles,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (id) => {
      // Keep the sign-in details on screen so the owner can pass them on.
      setCreated({ id, email: email.trim().toLowerCase(), password });
      void qc.invalidateQueries({ queryKey: ["staff"] });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add staff</CardTitle>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardBody>
        {created ? (
          <div className="space-y-3">
            <div role="status" className="space-y-1 rounded-2xl bg-brand-light p-4">
              <p className="font-extrabold text-brand-dark">Account ready. They can sign in now with:</p>
              <p className="font-mono text-sm">{created.email}</p>
              <p className="font-mono text-sm">{created.password}</p>
              <p className="pt-1 text-xs text-muted">This password is only shown now. You can set a new one any time.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setCreated(null);
                  setName("");
                  setEmail("");
                  setPassword(generatePassword());
                }}
              >
                Add another
              </Button>
              <Button onClick={() => onDone(created.id)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block text-sm font-bold text-ink">
              Full name
              <Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </label>
            <label className="block text-sm font-bold text-ink">
              Email (used to sign in)
              <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className="mt-1" />
            </label>
            <PasswordField label="Password" value={password} onChange={setPassword} />
            <RolesEditor roles={roles} onChange={setRoles} />
            {create.error && <p role="alert" className="text-sm text-danger">{toErrorMessage(create.error)}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={create.isPending || roles.length === 0}>
              {create.isPending ? "Creating..." : "Create account"}
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

function EditStaff({ s, isSelf, onClose }: { s: Staff; isSelf: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(s.full_name);
  const [roles, setRoles] = useState<RoleRow[]>(s.roles);
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState(generatePassword);
  const [note, setNote] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["staff"] });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_update_staff", { p_user_id: s.id, p_full_name: name, p_roles: roles });
      if (error) throw error;
    },
    onSuccess: () => {
      setNote("Saved.");
      refresh();
    },
  });

  const reset = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_set_password", { p_user_id: s.id, p_password: password });
      if (error) throw error;
    },
    onSuccess: () => {
      setResetting(false);
      setNote(`New password: ${password}`);
    },
  });

  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_set_staff_active", { p_user_id: s.id, p_active: !s.is_active });
      if (error) throw error;
    },
    onSuccess: () => {
      setNote(s.is_active ? "Account turned off. They can no longer sign in." : "Account turned back on.");
      refresh();
    },
  });

  const error = save.error ?? reset.error ?? toggle.error;

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="truncate">{s.full_name}</CardTitle>
          <p className="truncate text-sm text-muted">{s.email}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardBody className="space-y-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setNote(null);
            save.mutate();
          }}
        >
          <label className="block text-sm font-bold text-ink">
            Full name
            <Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </label>
          {s.is_super_admin ? (
            <p className="rounded-xl bg-surface px-3 py-2 text-sm text-muted">The owner can see and work in every branch.</p>
          ) : (
            <RolesEditor roles={roles} onChange={setRoles} />
          )}
          <Button type="submit" className="w-full" disabled={save.isPending || (!s.is_super_admin && roles.length === 0)}>
            Save changes
          </Button>
        </form>

        <div className="space-y-2 border-t border-line pt-4">
          {resetting ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                setNote(null);
                reset.mutate();
              }}
            >
              <PasswordField label="New password" value={password} onChange={setPassword} />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setResetting(false)}>
                  Back
                </Button>
                <Button type="submit" disabled={reset.isPending || password.length < 6}>
                  Set password
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => setResetting(true)}>
              <KeyRound className="h-5 w-5" aria-hidden /> Reset password
            </Button>
          )}

          {!isSelf && (
            <Button
              variant={s.is_active ? "ghost" : "secondary"}
              className={cn("w-full", s.is_active && "text-danger hover:bg-danger/10")}
              disabled={toggle.isPending}
              onClick={() => {
                const msg = s.is_active
                  ? `Turn off ${s.full_name}'s account? They won't be able to sign in. Their past sales stay.`
                  : `Turn ${s.full_name}'s account back on?`;
                if (window.confirm(msg)) {
                  setNote(null);
                  toggle.mutate();
                }
              }}
            >
              {s.is_active ? <UserX className="h-5 w-5" aria-hidden /> : <UserCheck className="h-5 w-5" aria-hidden />}
              {s.is_active ? "Turn off account" : "Turn account back on"}
            </Button>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-danger">{toErrorMessage(error)}</p>}
        {note && (
          <p role="status" className="rounded-xl bg-brand-light px-3 py-2 text-sm font-bold text-brand-dark">
            {note}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
