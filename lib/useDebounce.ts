import { useCallback, useRef } from 'react';

/**
 * Returns a debounced version of `fn` that will not fire until
 * at least `delayMs` milliseconds have elapsed since the last call.
 *
 * Usage:
 *   const handleGenerate = useDebounce(async () => { ... }, 600);
 */
export function useDebounce<T extends (...args: any[]) => any>(
  fn: T,
  delayMs = 500
): (...args: Parameters<T>) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fn(...args);
      }, delayMs);
    },
    // fn changes identity every render in most components — include delayMs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [delayMs]
  );
}
