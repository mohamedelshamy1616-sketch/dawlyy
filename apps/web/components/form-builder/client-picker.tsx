'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { formRequest } from '../form-runner/http';

const listSchema = z.object({ items: z.array(z.object({ id: z.string(), firstName: z.string(), lastName: z.string().nullable().optional() })) });
type Option = { value: string; label: string };

/** Task 7: coach client lookup (GET /clients, RLS-scoped) used by send and customize. */
export function ClientPicker({ value, onChange }: { value: string; onChange(id: string): void }) {
  const t = useTranslations('forms');
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true); setFailed(false);
      formRequest(`/clients?${new URLSearchParams({ limit: '30', ...(query.trim() ? { q: query.trim() } : {}) })}`)
        .then(data => {
          if (!active) return;
          const found = listSchema.parse(data).items.map(item => ({ value: item.id, label: [item.firstName, item.lastName].filter(Boolean).join(' ') }));
          setOptions(previous => {
            const chosen = previous.find(option => option.value === value && !found.some(item => item.value === value));
            return chosen ? [chosen, ...found] : found;
          });
        })
        .catch(() => { if (active) setFailed(true); })
        .finally(() => { if (active) setLoading(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [query, value]);

  return <VStack gap={2}>
    <TextInput label={t('actions.searchClient')} size="lg" type="search" value={query} isLoading={loading} onChange={setQuery} />
    <Selector label={t('actions.client')} width="100%" size="lg" value={value} options={options} placeholder={t('actions.pickClient')} emptyText={t('actions.noClients')} onChange={onChange} isRequired />
    {failed ? <Text color="secondary" as="p">{t('errors.request_failed')}</Text> : null}
  </VStack>;
}
