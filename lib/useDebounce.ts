import { useCallback, useRef, useEffect } from 'react';

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
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, delayMs);
    },
    [delayMs]
  );
}
