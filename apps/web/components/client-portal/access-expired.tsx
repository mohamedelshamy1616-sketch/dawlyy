'use client';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';

/** Shared renewal state; Astryx's link renderer keeps the current locale and direction. */
export function AccessExpired({ title, description, subscriptionLabel }: {
  title: string;
  description: string;
  subscriptionLabel: string;
}) {
  return <VStack gap={3} className="min-w-0 max-w-full break-words text-start">
    <Heading level={2}>{title}</Heading>
    <Text>{description}</Text>
    <Button href="/app/subscription" label={subscriptionLabel} variant="primary" className="min-h-11 min-w-11" />
  </VStack>;
}
