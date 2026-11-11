'use client';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Link } from '@/i18n/navigation';

/** One link of the settings hub, already translated by the page. */
export type HubItem = { href: string; title: string; body: string };

/** Task 11: the settings hub, one card per area the member may open. */
export function SettingsHub({ items }: { items: HubItem[] }) {
  return (
    <ul className="grid min-w-0 max-w-full gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.href} className="min-w-0">
          <Link href={item.href} className="block min-h-11 min-w-0 rounded-2xl focus-visible:outline-2">
            <Card>
              <VStack gap={1} className="min-w-0 [overflow-wrap:anywhere]">
                <Heading level={2}>{item.title}</Heading>
                <Text color="secondary">{item.body}</Text>
              </VStack>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
