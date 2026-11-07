"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/src/lib/supabase-browser";

export function SignOutButton() {
  const t = useTranslations("auth");
  const router = useRouter();

  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={signOut}>
      {t("signOut")}
    </Button>
  );
}
