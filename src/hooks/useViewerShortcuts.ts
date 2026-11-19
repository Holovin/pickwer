import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import type { NoteInputHandle } from '@/components/NoteInput';
import type { ToggleAction } from '@/hooks/useScreenshotList';
import type { VisibilityFilter } from '@/model/visibility';

interface ViewerShortcuts {
  preview: ReturnType<typeof useHeldPreview>;
  count: number;
  note: RefObject<NoteInputHandle | null>;
  sidebar: RefObject<HTMLElement | null>;
  onBrowse: (direction: number) => void;
  onReorder: (direction: number) => void;
  onFilter: (filter: VisibilityFilter) => void;
  onToggle: (action: ToggleAction) => void;
  onUndo: () => void;
  cancelConfirmation: () => void;
  clearHover: () => void;
}

function previewDigit({ key, code }: KeyboardEvent): number {
  if (/^(?:Digit|Numpad)[1-9]$/.test(code)) {
    return Number(code.slice(-1));
  }

  return /^[1-9]$/.test(key) ? Number(key) : 0;
}

function handleFirstPress(event: KeyboardEvent, action: () => void) {
  event.preventDefault();

  if (!event.repeat) {
    action();
  }
}

export function useHeldPreview() {
  const heldKeys = useRef(new Map<string, number>());
  const [heldPreview, setHeldPreview] = useState<number | null>(null);

  function clearHeldPreview() {
    heldKeys.current.clear();
    setHeldPreview(null);
  }

  function release(event: KeyboardEvent) {
    if (!heldKeys.current.delete(event.code || event.key)) {
      return;
    }

    setHeldPreview([...heldKeys.current.values()].at(-1) ?? null);
  }

  function hold(key: string, index: number) {
    heldKeys.current.set(key, index);
    setHeldPreview(index);
  }

  return { heldPreview, clearHeldPreview, hold, release, hasHeldKeys: () => heldKeys.current.size > 0 };
}

export function useViewerShortcuts({
  preview,
  count,
  note,
  sidebar,
  onBrowse,
  onReorder,
  onFilter,
  onToggle,
  onUndo,
  cancelConfirmation,
  clearHover,
}: ViewerShortcuts) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || (event.target instanceof Element && event.target.closest('[role="separator"]'))) {
      return;
    }

    const { key, code, altKey, ctrlKey, metaKey, shiftKey, isComposing } = event;
    const hasCommandModifier = altKey || ctrlKey || metaKey;
    const isPlainKey = !hasCommandModifier && !shiftKey && !isComposing;
    const isStashKey = key === '[' || key === ']' || code === 'BracketLeft' || code === 'BracketRight';

    if (!isPlainKey || (key !== 'Backspace' && !isStashKey)) {
      cancelConfirmation();
    }

    if (isPlainKey && (key === 'Tab' || key === 'Enter')) {
      const editingNote = !!note.current?.isFocused();
      const otherField =
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, button, a, [contenteditable="true"]') &&
        !editingNote;
      // Tab from the sidebar moves on to its controls, so the note shortcut is not a focus trap.
      const tabInSidebar =
        key === 'Tab' && !editingNote && event.target instanceof Node && !!sidebar.current?.contains(event.target);

      if (!otherField && !tabInSidebar && note.current) {
        event.preventDefault();

        if (!event.repeat) {
          if (editingNote) {
            sidebar.current?.focus();
          } else {
            note.current.focus();
          }
        }

        return;
      }
    }

    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) {
      return;
    }

    if (
      (ctrlKey || metaKey) &&
      !altKey &&
      !shiftKey &&
      (key.toLowerCase() === 'z' || (code === 'KeyZ' && !/^[a-z]$/i.test(key)))
    ) {
      handleFirstPress(event, onUndo);
      return;
    }

    if (!altKey && !ctrlKey && (shiftKey || metaKey) && ['ArrowUp', 'ArrowDown'].includes(key)) {
      event.preventDefault();
      onReorder(key === 'ArrowUp' ? -1 : 1);
      return;
    }

    if (hasCommandModifier || isComposing) {
      return;
    }

    if (key === '-' || key === '=') {
      handleFirstPress(event, () => onFilter(key === '=' ? 'all' : 'normal'));
      return;
    }

    if (shiftKey) {
      return;
    }

    const digit = previewDigit(event);

    if (digit) {
      if (digit > count) {
        return;
      }

      event.preventDefault();

      if (!event.repeat) {
        preview.hold(code || key, digit - 1);
      }

      return;
    }

    if (isPlainKey && (isStashKey || key === 'Backspace')) {
      handleFirstPress(event, () => onToggle(isStashKey ? 'stash' : 'hide'));
      return;
    }

    if (!count || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
      return;
    }

    event.preventDefault();

    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      if (!event.repeat) {
        preview.hold(code || key, 0);
      }
    } else if (!preview.hasHeldKeys()) {
      onBrowse(key === 'ArrowDown' ? 1 : -1);
    }
  });

  const release = useEffectEvent(preview.release);
  const cancelPending = useEffectEvent(cancelConfirmation);
  const resetHold = useEffectEvent(() => {
    cancelConfirmation();
    preview.clearHeldPreview();
    clearHover();
  });

  useEffect(() => {
    function visibility() {
      if (document.hidden) {
        resetHold();
      }
    }

    window.addEventListener('pointerdown', cancelPending);
    window.addEventListener('click', cancelPending);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', release);
    window.addEventListener('blur', resetHold);
    document.addEventListener('visibilitychange', visibility);

    return () => {
      window.removeEventListener('pointerdown', cancelPending);
      window.removeEventListener('click', cancelPending);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', release);
      window.removeEventListener('blur', resetHold);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
}
