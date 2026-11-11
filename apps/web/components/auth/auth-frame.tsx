"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { LocaleSwitch } from "@/src/components/shell/locale-switch";
import { Wordmark } from "@/src/components/shell/wordmark";

/** Task 2: shared full-screen auth presentation in both directions. */
export function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <VStack as="main" id="main" className="min-h-svh w-full max-w-full overflow-x-clip bg-linear-to-b from-brand-soft to-background px-4 py-6">
      <VStack gap={6} vAlign="center" className="mx-auto w-full min-w-0 max-w-sm flex-1">
        <HStack gap={2} hAlign="between" vAlign="center">
          <Wordmark asLink={false} className="min-w-0" />
          <LocaleSwitch />
        </HStack>
        <VStack gap={1} className="text-start">
          <Heading level={1}>{title}</Heading>
          {subtitle ? <Text as="p" type="supporting" color="secondary">{subtitle}</Text> : null}
        </VStack>
        <Card elevation="low" className="w-full min-w-0 max-w-full">
          <VStack gap={6} className="min-w-0 break-words [&_button]:min-h-11 [&_input]:min-h-11 [&_a]:min-h-11">{children}</VStack>
        </Card>
      </VStack>
    </VStack>
  );
}

/** Task 2: meaningful loading shell shared by all four auth routes. */
export function AuthLoading() {
  const t = useTranslations("common");
  return (
    <VStack as="main" id="main" className="min-h-svh w-full min-w-0 max-w-full overflow-x-clip bg-linear-to-b from-brand-soft to-background px-4 py-6">
      <VStack gap={6} vAlign="center" className="mx-auto w-full min-w-0 max-w-sm flex-1">
        <HStack gap={2} hAlign="between" vAlign="center"><Wordmark asLink={false} className="min-w-0" /><LocaleSwitch /></HStack>
        <Card className="w-full min-w-0 max-w-full">
          <VStack gap={6} role="status" aria-busy="true">
            <Text className="sr-only">{t("loading")}</Text>
            <VStack gap={2}>
              <Skeleton width="10rem" height="2rem" radius={2} />
              <Skeleton width="100%" height="1rem" radius={1} className="max-w-64" />
            </VStack>
            <VStack gap={3}>
              {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} height="5rem" index={index} />)}
            </VStack>
          </VStack>
        </Card>
      </VStack>
    </VStack>
  );
}

/** P5 group A: client presentation for the server-only demo-user lookup. */
export function DevLoginPanelView({ locale, users, title, description, empty, roles }: {
  locale: string;
  users: { userId: string; displayName: string; role: "owner" | "staff" | "client"; tenantName: string }[];
  title: string;
  description: string;
  empty: string;
  roles: Record<"owner" | "staff" | "client", string>;
}) {
  return (
    <VStack as="section" gap={3} padding={4} aria-labelledby="dev-login-title" className="min-w-0 rounded-lg border border-dashed border-border bg-background">
      <Heading level={2} id="dev-login-title">{title}</Heading>
      <Text as="p" type="supporting" color="secondary">{description}</Text>
      {users.length === 0 ? <Text as="p" type="supporting">{empty}</Text> : null}
      {users.map((user) => (
        <form key={`${user.userId}-${user.tenantName}-${user.role}`} action="/api/dev-login" method="post">
          <input type="hidden" name="userId" value={user.userId} />
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="secondary" label={`${user.displayName} ${roles[user.role]} · ${user.tenantName}`} className="h-auto min-h-11 w-full whitespace-normal py-2 text-start">
            <VStack as="span" gap={1} hAlign="start" className="min-w-0 max-w-full">
              <Text className="break-words" color="inherit">{user.displayName}</Text>
              <Text type="supporting" color="secondary" className="break-words">{roles[user.role]} · {user.tenantName}</Text>
            </VStack>
          </Button>
        </form>
      ))}
    </VStack>
  );
}
