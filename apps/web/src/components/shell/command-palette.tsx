'use client';
import { useEffect, useId, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Button } from '@astryxdesign/core/Button';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Link, useRouter } from '@/i18n/navigation';
import { searchKey } from '@dawlyy/core/text';
import { COACH_NAV, COACH_PROFILE_NAV } from './nav-items';
import { LIBRARY_LINKS, LIBRARY_TOOL_LINKS, MONEY_LINKS } from './hub-links';

const clientResults = z.object({ items: z.array(z.object({ id: z.uuid(), code: z.string(), displayName: z.string().nullable(), firstName: z.string(), lastName: z.string().nullable() })) });
const archiveLinks = LIBRARY_LINKS.map(item => ({ ...item, href: `${item.href}${item.href.includes('?') ? '&' : '?'}archived=true`, archived: true }));
const actions: { key: string; href: string; archived?: boolean }[] = [...new Map<string, { key: string; href: string; archived?: boolean }>(
  [...COACH_NAV, ...COACH_PROFILE_NAV, ...LIBRARY_LINKS, ...LIBRARY_TOOL_LINKS, ...MONEY_LINKS, ...archiveLinks].map(item => [item.href, item]),
).values()];

/** R1b: desktop client/action search with abortable requests, arrow keys, Enter and native dialog focus handling. */
export function CommandPalette() {
  const t = useTranslations('nav'); const common = useTranslations('common'); const activity = useTranslations('activity'); const router = useRouter(); const id = useId();
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const [active, setActive] = useState(0);
  const [clients, setClients] = useState<{ label: string; href: string }[]>([]);
  const [loading, setLoading] = useState(false); const [failed, setFailed] = useState(false);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && window.matchMedia('(min-width: 768px)').matches) {
        event.preventDefault(); setOpen(value => !value); setQuery(''); setClients([]); setLoading(false); setFailed(false); setActive(0);
      }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    if (!open || !query.trim()) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true); setFailed(false);
      try {
        const response = await fetch(`/api/v1/clients?q=${encodeURIComponent(query.trim())}&limit=8`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('search');
        const data = clientResults.parse(await response.json());
        if (!controller.signal.aborted) setClients(data.items.map(client => ({
          label: `${client.displayName || [client.firstName, client.lastName].filter(Boolean).join(' ')} · ${client.code}`,
          href: `/coach/clients/${client.id}`,
        })));
      } catch { if (!controller.signal.aborted) setFailed(true); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [query, open]);
  const folded = searchKey(query);
  const results = [...(query.trim() ? clients : []), ...actions.map(item => ({ label: item.key === 'activity' ? activity('title') : item.archived ? t('archivedFor', { name: t(`coach.${item.key}`) }) : t(`coach.${item.key}`), href: item.href })).filter(item => !folded || searchKey(item.label).includes(folded))];
  const selected = Math.min(active, Math.max(0, results.length - 1));
  useEffect(() => {
    if (open) document.getElementById(`${id}-result-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, selected, id]);
  function changeOpen(value: boolean) { setOpen(value); setQuery(''); setClients([]); setLoading(false); setFailed(false); setActive(0); }
  return <>
    <Button label={t('command.open')} variant="ghost" icon={<Search aria-hidden className="size-4" />} className="min-h-11" onClick={() => changeOpen(true)} />
    <Dialog isOpen={open} onOpenChange={changeOpen} aria-labelledby={`${id}-title`} padding={4}>
      <VStack gap={3} className="min-w-0 max-w-full">
        <HStack gap={2} hAlign="between" vAlign="center"><Heading level={2} id={`${id}-title`}>{t('command.title')}</Heading>
          <Button label={common('close')} variant="ghost" isIconOnly icon={<X aria-hidden className="size-5" />} className="min-h-11 min-w-11" onClick={() => changeOpen(false)} /></HStack>
        <TextInput label={t('command.search')} value={query} placeholder={t('command.placeholder')}
          onChange={value => { setQuery(value); setClients([]); setActive(0); setFailed(false); setLoading(Boolean(value.trim())); }}
          role="combobox" aria-expanded={true} aria-controls={`${id}-results`} aria-autocomplete="list"
          aria-activedescendant={results.length ? `${id}-result-${selected}` : undefined}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault(); setActive(current => Math.max(0, Math.min(results.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))));
            } else if (event.key === 'Enter') {
              const result = results[selected]; if (result) { event.preventDefault(); changeOpen(false); router.push(result.href); }
            }
          }} />
        <Text type="supporting" size="xsm" role="status" aria-live="polite">{loading ? t('command.searching') : failed ? t('command.error') : t('command.hint')}</Text>
        <ul id={`${id}-results`} role="listbox" aria-label={t('command.title')} className="m-0 max-h-80 list-none overflow-y-auto p-0">
          {results.map((result, index) => <li key={result.href} id={`${id}-result-${index}`} role="option" aria-selected={index === selected}>
            <Link href={result.href} prefetch={false} onClick={() => changeOpen(false)} tabIndex={-1}
              className="flex min-h-11 min-w-0 items-center rounded-lg px-3 py-2 hover:bg-muted" onMouseEnter={() => setActive(index)}>
              <Text className={`break-words ${index === selected ? 'font-semibold text-brand' : ''}`}>{result.label}</Text>
            </Link>
          </li>)}
        </ul>
        {!results.length && !loading ? <Text>{t('command.empty')}</Text> : null}
      </VStack>
    </Dialog>
  </>;
}
