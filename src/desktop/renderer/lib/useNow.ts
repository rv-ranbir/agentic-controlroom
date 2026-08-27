import { useEffect, useState } from "react";

/** Re-renders the caller every `intervalMs` so relative-time labels (elapsed, "3m") stay fresh. */
export function useNow(intervalMs = 20000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
