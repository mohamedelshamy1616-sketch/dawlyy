import { getLocale } from "next-intl/server";
import type { AuthContext } from "@dawlyy/db";
import { redirect } from "@/i18n/navigation";
import { requirePage } from "@/src/server/auth";

type Props = {
  /** Roles allowed in this area. Others are sent to their own area. */
  roles: AuthContext["role"][];
  /** Where a signed-in user with a different role goes. */
  fallback: "/coach" | "/app/today";
  children: React.ReactNode;
};

/** Server-side gate for a layout: signed-out visitors go to login, wrong-role users to their own area. */
export async function AuthGate({ roles, fallback, children }: Props) {
  const auth = await requirePage();
  if (!roles.includes(auth.role)) redirect({ href: fallback, locale: await getLocale() });
  return <>{children}</>;
}
