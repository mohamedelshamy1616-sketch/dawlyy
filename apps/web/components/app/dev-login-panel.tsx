import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';

type Props = {
  locale: string;
  users: { userId: string; displayName: string; role: 'owner' | 'staff' | 'client'; tenantName: string }[];
};

/** doc §14 / P2B local testing: visibly labelled development forms for seeded demo memberships. */
export async function DevLoginPanel({ locale, users }: Props) {
  const t = await getTranslations('auth');
  return (
    <section aria-labelledby="dev-login-title" className="flex min-w-0 flex-col gap-3 rounded-lg border border-dashed border-border bg-background p-4">
      <h2 id="dev-login-title" className="text-base font-semibold">{t('devLogin.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('devLogin.description')}</p>
      {users.length === 0 ? <p className="text-sm">{t('devLogin.empty')}</p> : null}
      {users.map((user) => (
        <form key={`${user.userId}-${user.tenantName}-${user.role}`} action="/api/dev-login" method="post">
          <input type="hidden" name="userId" value={user.userId} />
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="outline" className="h-auto min-h-11 w-full flex-col items-start gap-1 whitespace-normal py-2 text-start">
            <span className="break-words">{user.displayName}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {t(`devLogin.roles.${user.role}`)} · {user.tenantName}
            </span>
          </Button>
        </form>
      ))}
    </section>
  );
}
