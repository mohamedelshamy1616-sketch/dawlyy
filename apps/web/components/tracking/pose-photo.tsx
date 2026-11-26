'use client';
import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Text } from '@astryxdesign/core/Text';

/**
 * One progress photo. A signed URL can point at a file that is not stored (for example a requested photo that was never
 * uploaded); the browser then shows a broken-image icon. On a load error this shows the translated "not available" line.
 */
export function PosePhoto({ url, alt, width, height, className }: { url?: string; alt: string; width: number; height: number; className?: string }) {
  const t = useTranslations('tracking');
  const [failed, setFailed] = useState(false);
  if (failed || !url) return <Text as="p" type="supporting" role="img" aria-label={alt}>{t('photos.unavailable')}</Text>;
  return <Image unoptimized src={url} alt={alt} width={width} height={height} className={className} onError={() => setFailed(true)} />;
}
