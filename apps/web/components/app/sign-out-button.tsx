"use client";

import { useTranslations } from "next-intl";
import { Button } from "@astryxdesign/core/Button";
import { useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/src/lib/supabase-browser";
import { signOutWithPushCleanup } from "@/src/lib/push-sign-out";

export function SignOutButton() {
  const t = useTranslations("auth");
  const router = useRouter();

  async function signOut() {
    await signOutWithPushCleanup(() => createSupabaseBrowserClient().auth.signOut());
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button className="min-h-11 min-w-11" variant="secondary" size="sm" onClick={signOut} label={t("signOut")} />
  );
}
