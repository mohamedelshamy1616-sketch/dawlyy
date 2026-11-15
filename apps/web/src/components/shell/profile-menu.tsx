'use client';
import { useId, useState } from 'react';
import { UserRound, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Drawer } from '@astryxdesign/core/Drawer';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Link, usePathname } from '@/i18n/navigation';
import { COACH_PROFILE_NAV, isActive } from './nav-items';
import { LocaleSwitch } from './locale-switch';
import { SignOutButton } from './sign-out-button';

/** R1b: profile tools share one accessible drawer on phone and desktop. */
export function ProfileMenu() {
  const t = useTranslations('nav'); const common = useTranslations('common'); const activity = useTranslations('activity');
  const pathname = usePathname(); const [open, setOpen] = useState(false); const id = useId();
  return <>
    <Button label={t('profile')} variant="ghost" icon={<UserRound className="size-5" aria-hidden />}
      className="min-h-11 min-w-11" aria-haspopup="dialog" aria-controls={id} aria-expanded={open} onClick={() => setOpen(true)} />
    <Drawer id={id} isOpen={open} onOpenChange={setOpen} side="end" label={t('profile')} padding={4}>
      <VStack gap={3} className="min-w-0 max-w-full">
        <HStack hAlign="between" vAlign="center" gap={2}>
          <Heading level={2}>{t('profile')}</Heading>
          <Button label={common('close')} variant="ghost" isIconOnly icon={<X aria-hidden className="size-5" />}
            className="min-h-11 min-w-11" onClick={() => setOpen(false)} />
        </HStack>
        <nav aria-label={t('profile')}>
          <ul className="m-0 list-none p-0">
            {COACH_PROFILE_NAV.map(item => <li key={item.href}>
              <Link href={item.href} prefetch={false} onClick={() => setOpen(false)} aria-current={isActive(pathname, item) ? 'page' : undefined}
                className="focus-ring flex min-h-11 items-center gap-3 rounded-lg px-3 hover:bg-muted aria-[current=page]:bg-brand-soft">
                <item.Icon className="size-4 shrink-0" aria-hidden /><Text>{item.key === 'activity' ? activity('title') : t(`coach.${item.key}`)}</Text>
              </Link>
            </li>)}
          </ul>
        </nav>
        <HStack gap={2} wrap="wrap" className="border-t pt-3"><LocaleSwitch /><SignOutButton withLabel /></HStack>
      </VStack>
    </Drawer>
  </>;
}
