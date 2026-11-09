'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { createSupabaseBrowserClient } from '@/src/lib/supabase-browser';
import { AuthFeedback } from './form-fields';

/** Task 2: finish Supabase's browser PKCE/implicit callback before the server discovers membership. */
export function SessionReturn({ fallback = '/login' }: { fallback?: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    async function finish() {
      try {
        // createBrowserClient detects and exchanges its URL code using the stored PKCE verifier.
        const { data, error: providerError } = await createSupabaseBrowserClient().auth.getSession();
        if (!active) return;
        if (providerError) { setError(true); return; }
        if (!data.session) { router.replace(fallback); return; }
        window.history.replaceState(null, '', window.location.pathname);
        router.refresh();
      } catch { if (active) setError(true); }
    }
    void finish();
    return () => { active = false; };
  }, [fallback, router]);
  return error ? <AuthFeedback code="unknown" /> : <p role="status" className="text-sm text-muted-foreground">{t('working')}</p>;
}
