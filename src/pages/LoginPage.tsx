import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

export function LoginPage() {
  const { user, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/pos" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await signIn(email, password);
    setBusy(false);
    if (res.error) setError("Email or password is incorrect. Ask your branch manager to reset it if needed.");
  }

  const fb = import.meta.env.VITE_FACEBOOK_PAGE_URL;

  return (
    <div className="grid h-full place-items-center bg-ube px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Bakery Group POS</h1>
          <p className="text-sm text-muted">HJMD, GMD, and DJMD branches</p>
        </div>
        <label className="block text-sm font-semibold">
          Email
          <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm font-semibold">
          Password
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </Button>
        {fb && (
          <a href={fb} target="_blank" rel="noreferrer" className="block text-center text-sm font-semibold text-ube hover:underline">
            Visit our Facebook page
          </a>
        )}
      </form>
    </div>
  );
}
