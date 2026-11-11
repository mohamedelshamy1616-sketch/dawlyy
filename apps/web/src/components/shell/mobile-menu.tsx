"use client";

import { useId, useState } from "react";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@astryxdesign/core/Button";
import { Drawer } from "@astryxdesign/core/Drawer";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";
import { Wordmark } from "./wordmark";

/** Coach navigation on small screens: a menu button that opens the full list from the start edge. */
export function MobileMenu() {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const drawerId = useId();

  return (
    <>
      <Button type="button" variant="ghost" label={t("menu")}
        icon={<Menu className="size-5" aria-hidden />} isIconOnly
        aria-haspopup="dialog" aria-expanded={open} aria-controls={drawerId}
        onClick={() => setOpen(true)} className="min-h-11 min-w-11 shrink-0" />
      <Drawer id={drawerId} isOpen={open} onOpenChange={setOpen} side="start"
        label={t("menu")} padding={0} className="bg-sidebar text-sidebar-foreground">
        <VStack gap={2} className="min-h-full min-w-0">
          <HStack gap={2} hAlign="between" vAlign="center" padding={3}>
            <Heading level={2} className="sr-only">{t("menu")}</Heading>
            <Wordmark asLink={false} />
            <Button type="button" variant="ghost" label={t("close")}
              icon={<X className="size-5" aria-hidden />} isIconOnly
              onClick={() => setOpen(false)} className="min-h-11 min-w-11 shrink-0" />
          </HStack>
          <NavLinks area="coach" layout="sidebar" onNavigate={() => setOpen(false)}
            className="min-h-0 overflow-y-auto px-3" />
          <VStack padding={3} className="mt-auto border-t">
            <SignOutButton withLabel />
          </VStack>
        </VStack>
      </Drawer>
    </>
  );
}
