import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { useAuth } from "@/context/AuthContext";
import { useT } from "@/lib/i18n";

export function LoginPage() {
  const { user, signIn } = useAuth();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await signIn(email, password);
    setBusy(false);
    if (res.error) setError(t("Email or password is incorrect. Ask your branch manager to reset it if needed."));
  }

  const fb = import.meta.env.VITE_FACEBOOK_PAGE_URL;

  return (
    // Logo has a white background, so it sits on a white card against the green page background.
    <div className="flex min-h-full flex-col items-center justify-center gap-6 bg-brand px-4 py-10">
      <img
        src="/logo.png"
        alt="GMD Bakery, home of the special mamon de tabla"
        width={624}
        height={690}
        className="h-auto w-full max-w-[260px] rounded-3xl bg-white p-4 shadow-xl"
      />
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-ink">{t("Welcome!")}</h1>
            <p className="text-muted">{t("Sign in to start selling.")}</p>
          </div>
          <LanguageToggle />
        </div>
        <label className="block text-sm font-bold text-ink">
          Email
          <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm font-bold text-ink">
          {t("Password")}
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" size="xl" className="w-full" disabled={busy}>
          {busy ? t("Signing in...") : t("Sign in")}
        </Button>
        {fb && (
          <a href={fb} target="_blank" rel="noreferrer" className="block text-center text-sm font-bold text-brand hover:underline">
            {t("Visit our Facebook page")}
          </a>
        )}
      </form>
    </div>
  );
}
