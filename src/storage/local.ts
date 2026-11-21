import { clampPanelSplit, panelSplit, validZoom } from '@/model/viewer';
import type { SavedFile, SavedState, ViewerSettings } from '@/model/settings';
import { validateState } from '@/storage/validation';

export const storageKey = (folder: string) => `pickwer:v1:${encodeURIComponent(folder)}`;

export function readState(folder: string): SavedState | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(folder)) ?? 'null');

    return validateState(value);
  } catch {
    return null;
  }
}

export function saveState(folder: string, state: SavedState): boolean {
  try {
    localStorage.setItem(storageKey(folder), JSON.stringify(state));

    return true;
  } catch {
    return false;
  }
}

// Keep absent files in their slots so external deletions do not erase their history.
export function mergeFiles(previous: SavedFile[], current: SavedFile[]): SavedFile[] {
  const ids = new Set(current.map((f) => f.id));
  let next = 0;
  const result = previous.map((f) => (ids.has(f.id) ? current[next++] : f));

  return [...result, ...current.slice(next)];
}

const viewerKey = 'pickwer:viewer:v1';

export function readViewerSettings(): ViewerSettings {
  const defaults = { zoom: 'fit', rightZoom: 'fit', split: panelSplit.initial };

  try {
    const value = JSON.parse(localStorage.getItem(viewerKey) ?? 'null');

    if (!value || typeof value !== 'object') {
      return defaults;
    }

    return {
      zoom: validZoom(value.zoom) ? value.zoom : 'fit',
      rightZoom: validZoom(value.rightZoom) ? value.rightZoom : 'fit',
      split:
        typeof value.split === 'number' && Number.isFinite(value.split)
          ? clampPanelSplit(value.split)
          : panelSplit.initial,
    };
  } catch {
    return defaults;
  }
}

export function saveViewerSettings(settings: ViewerSettings): boolean {
  try {
    localStorage.setItem(viewerKey, JSON.stringify(settings));

    return true;
  } catch {
    return false;
  }
}

export function stampState(state: SavedState, previous: SavedState | null): SavedState {
  if (
    previous &&
    state.activeId === previous.activeId &&
    state.showHidden === previous.showHidden &&
    state.showStash === previous.showStash &&
    state.files.length === previous.files.length &&
    state.files.every((file, index) => {
      const other = previous.files[index];

      return (
        file.id === other.id &&
        file.number === other.number &&
        file.hidden === other.hidden &&
        file.stashed === other.stashed &&
        file.note === other.note
      );
    })
  ) {
    return previous;
  }

  return { ...state, updatedAt: Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1) };
}

export function reconcileState(local: SavedState | null, disk: SavedState): SavedState {
  if (!local || disk.updatedAt > local.updatedAt) {
    return disk;
  }
  if (local.updatedAt > disk.updatedAt) {
    return local;
  }

  // Opening a folder can assign numbers to new PNGs without editing the JSON.
  const ids = new Set(disk.files.map((file) => file.id));
  const numbers = new Set(disk.files.map((file) => file.number));
  const discovered = local.files.filter((file) => !ids.has(file.id) && !numbers.has(file.number));

  return discovered.length ? { ...disk, files: [...disk.files, ...discovered] } : disk;
}
