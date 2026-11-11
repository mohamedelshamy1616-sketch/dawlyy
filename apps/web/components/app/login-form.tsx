"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { AuthField } from "@/components/auth/form-fields";
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
      <AuthField
        label={t("email")}
        id="email"
        type="email"
        autoComplete="email"
        dir="ltr"
        className="text-start"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <AuthField
        label={t("password")}
        id="password"
        type="password"
        autoComplete="current-password"
        dir="ltr"
        className="text-start"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {message ? (
        <Text as="p" type="supporting" role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {message.text}
        </Text>
      ) : null}
      <Button variant="primary" className="min-h-11 min-w-11" type="submit" isDisabled={pending || !password} label={t("signIn")} />
      <Button className="min-h-11 min-w-11" type="button" variant="secondary" isDisabled={pending} onClick={sendMagicLink} label={t("magicLink")} />
      <Link href="/signup" className="inline-flex min-h-11 items-center justify-center text-sm underline">{t("createAccount")}</Link>
      <Link href="/reset" className="inline-flex min-h-11 items-center justify-center text-sm underline">{t("forgotPassword")}</Link>
    </form>
  );
}
