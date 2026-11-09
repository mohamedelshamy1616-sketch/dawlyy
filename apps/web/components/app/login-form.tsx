"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/src/lib/supabase-browser";

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithPassword({ email, password });
      if (error) {
        setMessage({ kind: "error", text: t("invalidCredentials") });
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: t("genericError") });
    } finally {
      setPending(false);
    }
  }

  async function sendMagicLink() {
    if (!email) {
      setMessage({ kind: "error", text: t("emailRequired") });
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}${window.location.pathname.replace(/\/login$/, "")}` },
      });
      setMessage(error ? { kind: "error", text: t("genericError") } : { kind: "info", text: t("magicLinkSent") });
    } catch {
      setMessage({ kind: "error", text: t("genericError") });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={signInWithPassword} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          dir="ltr"
          className="text-start"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          className="text-start"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {message ? (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {message.text}
        </p>
      ) : null}
      <Button type="submit" disabled={pending || !password}>
        {t("signIn")}
      </Button>
      <Button type="button" variant="outline" disabled={pending} onClick={sendMagicLink}>
        {t("magicLink")}
      </Button>
      <Link href="/signup" className="inline-flex min-h-11 items-center justify-center text-sm underline">{t("createAccount")}</Link>
      <Link href="/reset" className="inline-flex min-h-11 items-center justify-center text-sm underline">{t("forgotPassword")}</Link>
    </form>
  );
}
