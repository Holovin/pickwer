import type { SavedState, SavedFile } from '@/model/settings';

export function validateState(value: unknown): SavedState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const state = value as Record<string, unknown>;
  const { updatedAt, activeId, showHidden, showStash } = state;

  if (
    state.version !== 1 ||
    state.pathFormat !== 'relative-v1' ||
    !Array.isArray(state.files) ||
    typeof updatedAt !== 'number' ||
    !Number.isSafeInteger(updatedAt) ||
    updatedAt < 0 ||
    typeof showHidden !== 'boolean' ||
    typeof showStash !== 'boolean' ||
    (activeId !== undefined && typeof activeId !== 'string')
  ) {
    return null;
  }

  const ids = new Set<string>();
  const numbers = new Set<number>();
  const files: SavedFile[] = [];

  for (const entry of state.files) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const { id, number, hidden, stashed, note } = entry;

    if (
      typeof id !== 'string' ||
      !id.length ||
      ids.has(id) ||
      !Number.isSafeInteger(number) ||
      number < 1 ||
      numbers.has(number) ||
      typeof hidden !== 'boolean' ||
      typeof stashed !== 'boolean' ||
      (hidden && stashed) ||
      typeof note !== 'string'
    ) {
      return null;
    }
    ids.add(id);
    numbers.add(number);
    files.push({ id, number, hidden, stashed, note });
  }

  return { version: 1, pathFormat: 'relative-v1', updatedAt, files, activeId, showHidden, showStash };
}
