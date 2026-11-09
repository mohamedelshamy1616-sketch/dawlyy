'use client';

import { useRef, useState } from 'react';
import { z } from 'zod';

const errorSchema = z.object({ error: z.object({ code: z.string(), details: z.unknown().optional() }) });

/** Task 3: translated forms consume error codes, never database or validation messages. */
export function useMutation() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const busy = useRef(false);
  async function send(path: string, method: string, body?: unknown): Promise<unknown | undefined> {
    if (busy.current) return undefined;
    busy.current = true;
    setPending(true); setError(null); setSaved(false); setDuplicateId(null);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const fingerprint = JSON.stringify([path, method, payload]);
    const requestKey = retry.current?.fingerprint === fingerprint ? retry.current.key : crypto.randomUUID();
    retry.current = { fingerprint, key: requestKey };
    try {
      const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey }, body: payload });
      const result: unknown = await response.json();
      if (!response.ok) {
        const parsed = errorSchema.safeParse(result);
        const code = parsed.success ? parsed.data.error.code : 'failed';
        setError(['duplicate_client', 'validation_error', 'forbidden', 'not_found'].includes(code) ? code : 'failed');
        if (parsed.success) {
          const details = z.object({ clientId: z.string().uuid() }).safeParse(parsed.data.error.details);
          setDuplicateId(details.success ? details.data.clientId : null);
        }
        // A corrected form or changed permissions must be able to retry a refused request.
        retry.current = null;
        return undefined;
      }
      retry.current = null; setSaved(true);
      return result;
    } catch { setError('failed'); return undefined; }
    finally { busy.current = false; setPending(false); }
  }
  return { send, pending, error, duplicateId, saved };
}
