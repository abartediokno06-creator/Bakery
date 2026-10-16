/**
 * Creates the three test accounts used to exercise the app (owner, branch
 * manager, cashier) directly in Supabase Auth, then wires up their profiles
 * and branch roles exactly like supabase/bootstrap_users.sql does.
 *
 * Usage:
 *   1. Put SUPABASE_SERVICE_ROLE_KEY=... in .env.local (keep it out of git!)
 *   2. npm run db:seed-users
 *
 * Safe to re-run: existing accounts are updated instead of duplicated.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Minimal .env.local reader (KEY=value lines, # comments). */
function readEnvFile() {
  const out = {};
  try {
    const text = readFileSync(resolve(root, ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (line.trim().startsWith("#")) continue;
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2];
    }
  } catch {
    /* no .env.local */
  }
  return out;
}

const fileEnv = readEnvFile();
const URL_BASE = (process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY || "";
const PASSWORD = process.env.SEED_USER_PASSWORD || "bakery123";

if (!URL_BASE || !SERVICE_KEY) {
  console.error(
    [
      "Missing credentials.",
      "",
      "Need in .env.local (or as environment variables):",
      "  VITE_SUPABASE_URL=https://<project-ref>.supabase.co",
      "  SUPABASE_SERVICE_ROLE_KEY=<service_role key>   (Project Settings > API)",
      "",
      "The service_role key is only used here in Node; it is never shipped to the browser.",
    ].join("\n"),
  );
  process.exit(1);
}

const baseHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function call(path, init = {}) {
  const res = await fetch(`${URL_BASE}${path}`, {
    ...init,
    headers: { ...baseHeaders, ...(init.headers || {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      typeof body === "object" && body
        ? body.message || body.error_description || body.error || JSON.stringify(body)
        : body;
    const err = new Error(`${init.method || "GET"} ${path} -> ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const data = await call(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

async function ensureUser({ email, fullName }) {
  const user = (await findUserByEmail(email)) ?? null;
  let id;
  if (user) {
    id = user.id;
    console.log(`  = exists:   ${email}`);
  } else {
    const created = await call("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      }),
    });
    id = created.id;
    console.log(`  + created:  ${email}`);
  }
  // Profile row comes from the handle_new_user() trigger; keep the name in sync.
  await call(`/rest/v1/profiles?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ full_name: fullName }),
  });
  return id;
}

async function main() {
  console.log(`Seeding test users into ${URL_BASE}\n`);

  const branches = await call("/rest/v1/branches?select=id,code");
  if (!branches.length) {
    throw new Error("No branches found - run supabase/seed.sql on this project first.");
  }
  const branchId = (code) => {
    const b = branches.find((x) => x.code === code);
    if (!b) throw new Error(`Branch code ${code} not found. Available: ${branches.map((x) => x.code).join(", ")}`);
    return b.id;
  };

  // Same three accounts as supabase/bootstrap_users.sql.
  const owner = await ensureUser({ email: "owner@example.com", fullName: "Owner" });
  await call(`/rest/v1/profiles?id=eq.${owner}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ is_super_admin: true, is_active: true, default_branch_id: branchId("HJMD-IBN") }),
  });
  console.log("  ~ owner promoted to super admin (all 10 branches)");

  const staff = [
    {
      email: "manager.lipa@example.com",
      fullName: "Manager Lipa",
      roles: [
        { code: "JMD-LPA", role: "branch_manager" },
        { code: "HJMD-IBN", role: "branch_manager" },
      ],
    },
    {
      email: "cashier.ibaan@example.com",
      fullName: "Cashier Ibaan",
      roles: [{ code: "HJMD-IBN", role: "cashier" }],
    },
  ];

  for (const s of staff) {
    const id = await ensureUser(s);
    const rows = s.roles.map((r) => ({ user_id: id, branch_id: branchId(r.code), role: r.role }));
    await call(`/rest/v1/user_branch_roles?user_id=eq.${id}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    await call("/rest/v1/user_branch_roles", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
    await call(`/rest/v1/profiles?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ is_super_admin: false, is_active: true, default_branch_id: rows[0].branch_id }),
    });
    console.log(`  ~ roles:    ${s.email} -> ${s.roles.map((r) => `${r.role}@${r.code}`).join(", ")}`);
  }

  console.log(
    [
      "",
      "Done. Sign in at http://localhost:5173/login with:",
      "",
      `  owner@example.com          ${PASSWORD}   (owner: all 10 branches, Reports/Products/Staff)`,
      `  manager.lipa@example.com   ${PASSWORD}   (branch manager: Lipa + Ibaan)`,
      `  cashier.ibaan@example.com  ${PASSWORD}   (cashier: Ibaan only)`,
      "",
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}`);
  process.exit(1);
});

