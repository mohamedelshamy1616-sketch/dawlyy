"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";
import { Wordmark } from "./wordmark";

/** Coach navigation on small screens: a menu button that opens the full list from the start edge. */
export function MobileMenu() {
  const t = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="focus-ring inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
        >
          <Menu className="size-5" aria-hidden />
          <span className="sr-only">{t("menu")}</span>
        </button>
      </SheetTrigger>
      {/* The start edge is the right edge in Arabic. */}
      <SheetContent
        side={locale === "ar" ? "right" : "left"}
        showCloseButton={false}
        aria-describedby={undefined}
        className="gap-2 bg-sidebar text-sidebar-foreground"
      >
        <SheetHeader className="flex-row items-center justify-between p-3">
          <SheetTitle className="sr-only">{t("menu")}</SheetTitle>
          <Wordmark asLink={false} />
          <SheetClose asChild>
            <button
              type="button"
              className="focus-ring inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted"
            >
              <X className="size-5" aria-hidden />
              <span className="sr-only">{t("close")}</span>
            </button>
          </SheetClose>
        </SheetHeader>
        <NavLinks
          area="coach"
          layout="sidebar"
          onNavigate={() => setOpen(false)}
          className="overflow-y-auto px-3"
        />
        <div className="mt-auto border-t p-3">
          <SignOutButton withLabel />
        </div>
      </SheetContent>
    </Sheet>
  );
}
