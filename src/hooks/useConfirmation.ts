import { useCallback, useEffect, useState } from 'react';

const CONFIRMATION_TIMEOUT_MS = 10_000;

type Action = 'hide' | 'stash';

export interface PendingConfirmation {
  id: string;
  action: Action;
}

export function useConfirmation() {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const cancel = useCallback(() => setPending(null), []);

  useEffect(() => {
    if (!pending) {
      return;
    }

    const timer = window.setTimeout(cancel, CONFIRMATION_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [pending, cancel]);

  function confirm(id: string, action: Action): boolean {
    if (pending?.id === id && pending.action === action) {
      cancel();

      return true;
    }

    setPending({ id, action });

    return false;
  }

  return { pending, cancel, confirm };
}
