"use client";

import { Hammer } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/VStack";
import { EmptyState } from "./empty-state";
import { Wordmark } from "./wordmark";

const TARGETS = {
  coach: { href: "/coach", label: "backCoach" },
  client: { href: "/app/today", label: "backClient" },
  root: { href: "/", label: "backHome" },
} as const;

/**
 * Shown for any URL that has no page yet (many navigation links point at screens still to be built) and for
 * real 404s. Inside the coach or client area it renders in the content slot, so the shell stays visible.
 */
export function NotFoundState({ area }: { area: keyof typeof TARGETS }) {
  const t = useTranslations("notFound");
  const target = TARGETS[area];

  const state = (
    <EmptyState
      Icon={Hammer}
      title={t("title")}
      description={t("body")}
      action={
        <Button href={target.href} variant="primary" size="lg" label={t(target.label)}
          className="focus-ring min-h-11 px-5" />
      }
    />
  );

  if (area !== "root") return state;

  return (
    <VStack as="main" gap={8} hAlign="center" vAlign="center"
      id="main"
      className="mx-auto min-h-svh w-full max-w-md overflow-x-clip px-4 py-10"
    >
      <Wordmark />
      {state}
    </VStack>
  );
}
