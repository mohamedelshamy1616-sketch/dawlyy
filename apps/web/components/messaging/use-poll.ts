'use client';
import { useEffect, useRef } from 'react';

/**
 * Task 9: poll `task` every 15 s while the tab is visible, much more slowly while hidden, and back off after errors.
 * It is the only place that knows the transport, so Supabase Realtime can replace it later without touching the screens.
 * The first run happens after one interval; callers already have server-rendered data.
 */
export function usePoll(task: () => Promise<void>, options: { enabled?: boolean; visibleMs?: number; hiddenMs?: number } = {}): void {
  const { enabled = true, visibleMs = 15_000, hiddenMs = 120_000 } = options;
  const latest = useRef(task);
  useEffect(() => { latest.current = task; });
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined; let stopped = false; let running = false; let failures = 0;
    const delay = () => {
      const base = document.visibilityState === 'visible' ? visibleMs : hiddenMs;
      return Math.min(base * 2 ** Math.min(failures, 3), 300_000);
    };
    const schedule = () => { if (!stopped) timer = setTimeout(() => void run(), delay()); };
    const run = async () => {
      if (running) return;
      running = true;
      try { await latest.current(); failures = 0; } catch { failures += 1; } finally { running = false; }
      schedule();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer); void run();
    };
    document.addEventListener('visibilitychange', onVisible);
    schedule();
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [enabled, visibleMs, hiddenMs]);
}
