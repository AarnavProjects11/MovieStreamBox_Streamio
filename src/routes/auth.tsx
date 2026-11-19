import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Film, Eye, EyeOff, Sparkles, Copy } from "lucide-react";
import { scorePassword, generatePassword } from "@/lib/password";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · Stream Box" },
      { name: "description", content: "Sign in to your personal cloud streaming dashboard." },
    ],
  }),
  component: AuthPage,
});

const EPHEMERAL_KEY = "streambox.ephemeral";
const REMEMBER_KEY = "streambox.remember";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);

  const strength = useMemo(() => scorePassword(password), [password]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved !== null) setRemember(saved === "1");
    } catch {}
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/browse" });
    });
  }, [navigate]);

  function persistRememberChoice(value: boolean) {
    try {
      localStorage.setItem(REMEMBER_KEY, value ? "1" : "0");
      if (value) {
        localStorage.removeItem(EPHEMERAL_KEY);
      } else {
        // Mark session as tab-scoped: root will sign out on next fresh tab open.
        localStorage.setItem(EPHEMERAL_KEY, "1");
        sessionStorage.setItem(EPHEMERAL_KEY, "1");
      }
    } catch {}
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/browse` },
        });
        if (error) throw error;
        toast.success("Account created. You can sign in now.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        persistRememberChoice(remember);
        navigate({ to: "/browse" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function signInGoogle() {
    setBusy(true);
    try {
      // Lovable's OAuth broker only answers on Lovable preview/published hosts. On
      // any other host (a Vercel deployment, a custom domain) it just times out, so
      // go straight to Supabase — it redirects the browser to Google itself.
      const onLovableHost =
        /(^|\.)(lovable\.app|lovableproject\.com|lovableproject-dev\.com|gpt-eng\.com|gptengineer\.run)$/i.test(
          window.location.hostname,
        );
      if (!onLovableHost) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/browse` },
        });
        if (error) throw error;
        persistRememberChoice(remember);
        return;
      }
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/browse`,
      });
      if (result.error) {
        toast.error((result.error as Error).message ?? "Google sign-in failed");
        return;
      }
      if (result.redirected) return;
      persistRememberChoice(remember);
      navigate({ to: "/browse" });
    } catch (err: any) {
      toast.error(err.message ?? "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  function regenerate() {
    const next = generatePassword(16);
    setPassword(next);
    setShow(true);
    toast.success("Strong password generated");
  }

  async function copyPassword() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Password copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <main className="hero-stage relative min-h-screen overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[70vh] opacity-90" aria-hidden />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Film className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl leading-none font-display brand-gradient">STREAM BOX</h1>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mt-1">
              Personal cloud cinema
            </p>
          </div>
        </div>

        <Card className="p-6 bg-card/80 backdrop-blur border-border shadow-2xl">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 mb-5">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md py-2 text-sm font-semibold transition-colors ${
                  mode === m
                    ? "bg-background text-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <Button
            type="button"
            onClick={signInGoogle}
            disabled={busy}
            variant="outline"
            className="w-full h-11 gap-2 font-semibold"
          >
            <GoogleMark />
            Continue with Google
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or with email{" "}
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={onSubmit} className="space-y-4" method="post" action="#">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="username"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                inputMode="email"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "signup" && (
                  <button
                    type="button"
                    onClick={regenerate}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Sparkles className="h-3 w-3" /> Generate
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={show ? "text" : "password"}
                  required
                  minLength={1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className="pr-20 font-mono"
                />
                <div className="absolute inset-y-0 right-2 flex items-center gap-1">
                  {mode === "signup" && password && (
                    <button
                      type="button"
                      onClick={copyPassword}
                      aria-label="Copy password"
                      className="p-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? "Hide password" : "Show password"}
                    className="p-1.5 text-muted-foreground hover:text-foreground"
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {mode === "signup" && <StrengthMeter strength={strength} />}
            </div>

            {mode === "signin" && (
              <label className="flex items-center gap-2 text-sm select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <span>Remember me on this device</span>
              </label>
            )}

            <Button type="submit" className="w-full h-11" disabled={busy}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </Card>

        <Link
          to="/"
          className="mt-6 block text-center text-xs text-muted-foreground hover:text-foreground"
        >
          ← back home
        </Link>
      </div>
    </main>
  );
}

function StrengthMeter({ strength }: { strength: ReturnType<typeof scorePassword> }) {
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full transition-colors"
            style={{
              background:
                i <= strength.score
                  ? strength.color
                  : "color-mix(in oklch, var(--muted) 60%, transparent)",
            }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold" style={{ color: strength.color }}>
          {strength.label}
        </span>
        {strength.hints.length > 0 && (
          <span className="text-muted-foreground truncate ml-2">{strength.hints[0]}</span>
        )}
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.1 4 9.2 8.5 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.1 39.4 16 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C41 36 44 30.5 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
