export type StorageStatus =
  | { kind: 'closed' }
  | { kind: 'read-only' }
  | { kind: 'paused' }
  | { kind: 'clean' }
  | { kind: 'unsaved' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'failed'; cached: boolean };

export function describeStorageStatus(status: StorageStatus): string {
  switch (status.kind) {
    case 'closed':
      return 'No folder open';
    case 'read-only':
      return 'Read-only folder · export settings to keep changes';
    case 'paused':
      return 'JSON unreadable · autosave paused';
    case 'clean':
      return 'No pending changes';
    case 'unsaved':
      return 'Unsaved changes · waiting for inactivity';
    case 'saving':
      return 'Saving…';
    case 'saved':
      return `Saved · ${status.at.toLocaleString()}`;
    case 'failed':
      return status.cached ? 'Save failed · changes kept locally' : 'Save failed · changes kept in this session only';
  }
}
