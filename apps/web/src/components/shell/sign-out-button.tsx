"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/src/lib/supabase-browser";

/** Icon button (44 px) that signs out and returns to the login page. `withLabel` also shows the text. */
export function SignOutButton({ withLabel = false }: { withLabel?: boolean }) {
  const t = useTranslations("auth");
  const router = useRouter();

  async function signOut() {
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      aria-label={withLabel ? undefined : t("signOut")}
      className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-foreground hover:bg-muted"
    >
      <LogOut className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden />
      {withLabel ? <span>{t("signOut")}</span> : null}
    </button>
  );
}
