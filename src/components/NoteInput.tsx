import { useEffect, useImperativeHandle, useEffectEvent, useRef, useState, type RefObject } from 'react';

export interface NoteInputHandle {
  commit: () => void;
  focus: () => void;
  isFocused: () => boolean;
}

interface NoteInputProps {
  value: string;
  handle: RefObject<NoteInputHandle | null>;
  onCommit: (value: string) => void;
}

export function NoteInput({ value, handle, onCommit }: NoteInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const currentDraft = useRef(value);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) {
      currentDraft.current = value;
      setDraft(value);
    }
  }, [value]);

  function commit() {
    if (!dirty.current) {
      return;
    }

    dirty.current = false;
    onCommit(currentDraft.current);
  }

  useImperativeHandle(handle, () => ({
    commit,
    focus: () => input.current?.focus(),
    isFocused: () => document.activeElement === input.current,
  }));
  const flushOnUnmount = useEffectEvent(commit);

  // React does not guarantee blur when temporary preview replaces this input.
  useEffect(
    () => () => {
      flushOnUnmount();
    },
    [],
  );

  return (
    <input
      ref={input}
      className="note-input"
      aria-label="File note"
      placeholder="No note"
      value={draft}
      onChange={(event) => {
        currentDraft.current = event.currentTarget.value;
        dirty.current = true;
        setDraft(currentDraft.current);
      }}
      onBlur={commit}
    />
  );
}
