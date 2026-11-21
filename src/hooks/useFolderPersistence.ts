import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { SavedFile, SavedState, SettingsBackup } from '@/model/settings';
import { createBackup, exportBackup, writeBackupToDirectory } from '@/storage/backup';
import type { StorageStatus } from '@/model/storageStatus';
import { mergeFiles, saveState, stampState } from '@/storage/local';

const AUTOSAVE_DELAY_MS = 10_000;

// Continuous activity postpones the idle save; this caps how long edits can wait.
const AUTOSAVE_MAX_DELAY_MS = 30_000;

export interface OpenedFolder {
  key: string;
  name: string;
  directory: FileSystemDirectoryHandle | null;
  persistent: boolean;
  writable: boolean;
  restored: SavedState | null;
  recoverLocal: boolean;
}

interface PersistenceOptions {
  folder: OpenedFolder | null;
  files: SavedFile[];
  activeId?: string;
  showHidden: boolean;
  showStash: boolean;
  commitDraft: () => void;
  onError: (message: string) => void;
}

interface PendingSave {
  folder: OpenedFolder;
  backup: SettingsBackup;
  directory: FileSystemDirectoryHandle;
  cached: boolean;
  writing?: Promise<boolean>;
}

export function useFolderPersistence({
  folder,
  files,
  activeId,
  showHidden,
  showStash,
  commitDraft,
  onError,
}: PersistenceOptions) {
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({ kind: 'closed' });
  const [failedFolder, setFailedFolder] = useState<OpenedFolder | null>(null);
  const canExport = !!folder && (!folder.writable || failedFolder === folder);
  const mounted = useRef(false);
  const activeFolder = useRef<OpenedFolder | null>(null);
  const savedState = useRef<SavedState | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveTimer = useRef<number | undefined>(undefined);
  const pendingSave = useRef<PendingSave | null>(null);
  const switchBlocked = useRef(false);
  const unsavedSince = useRef<number | null>(null);

  const writePendingSave = useCallback((pending: PendingSave): Promise<boolean> => {
    if (pending.writing) {
      return pending.writing;
    }
    if (pendingSave.current !== pending) {
      return Promise.resolve(true);
    }

    window.clearTimeout(saveTimer.current);
    unsavedSince.current = null;
    if (mounted.current && pending.folder === activeFolder.current) {
      setStorageStatus({ kind: 'saving' });
    }
    pending.writing = saveQueue.current.then(async () => {
      if (pendingSave.current !== pending) {
        return true;
      }

      try {
        await writeBackupToDirectory(pending.backup, pending.directory);

        if (pendingSave.current === pending) {
          pendingSave.current = null;

          if (mounted.current && pending.folder === activeFolder.current) {
            setFailedFolder(null);
            setStorageStatus({ kind: 'saved', at: new Date() });
          }
        }

        return true;
      } catch {
        if (pendingSave.current === pending && mounted.current && pending.folder === activeFolder.current) {
          setFailedFolder(pending.folder);
          setStorageStatus({ kind: 'failed', cached: pending.cached });
        }

        pending.writing = undefined;

        return false;
      }
    });
    saveQueue.current = pending.writing.then(() => undefined);

    return pending.writing;
  }, []);

  useEffect(() => {
    const opening = activeFolder.current !== folder;
    activeFolder.current = folder;

    if (!folder) {
      window.clearTimeout(saveTimer.current);
      unsavedSince.current = null;
      pendingSave.current = null;
      setFailedFolder(null);
      setStorageStatus({ kind: 'closed' });
      savedState.current = null;
      return;
    }

    if (opening) {
      setFailedFolder(null);

      if (!folder.directory) {
        setStorageStatus({ kind: 'read-only' });
      } else if (!folder.writable) {
        setStorageStatus({ kind: 'paused' });
      } else {
        setStorageStatus({ kind: 'clean' });
      }
    }

    const previous = opening ? folder.restored : savedState.current;
    const state: SavedState = {
      version: 1,
      pathFormat: 'relative-v1',
      updatedAt: previous?.updatedAt ?? 0,
      files: mergeFiles(previous?.files ?? [], files),
      activeId,
      showHidden,
      showStash,
    };
    const stamped = opening ? state : stampState(state, previous);

    if (stamped === previous) {
      return;
    }

    savedState.current = stamped;

    let cached = false;

    if (folder.persistent) {
      cached = saveState(folder.key, stamped);

      if (!cached) {
        onError('The browser could not save your settings.');
      }
    }

    if (!folder.directory || !folder.writable || (opening && !folder.recoverLocal)) {
      return;
    }

    const pending: PendingSave = {
      folder,
      directory: folder.directory,
      cached,
      backup: createBackup(folder.name, stamped),
    };
    pendingSave.current = pending;
    window.clearTimeout(saveTimer.current);

    if (cached) {
      const now = Date.now();
      unsavedSince.current ??= now;
      const untilDeadline = unsavedSince.current + AUTOSAVE_MAX_DELAY_MS - now;
      setStorageStatus({ kind: 'unsaved' });
      saveTimer.current = window.setTimeout(
        () => {
          void writePendingSave(pending);
        },
        Math.max(0, Math.min(AUTOSAVE_DELAY_MS, untilDeadline)),
      );
    } else {
      void writePendingSave(pending);
    }
  }, [folder, files, activeId, showHidden, showStash, onError, writePendingSave]);

  async function flushPendingSave(): Promise<boolean> {
    for (;;) {
      // A draft can change while the previous write is in flight.
      flushSync(commitDraft);
      const pending = pendingSave.current;

      if (!pending) {
        return true;
      }
      if (!(await writePendingSave(pending))) {
        return false;
      }
    }
  }

  // A failed write keeps the current folder open once. Asking again leaves it
  // without saving, so a folder that can no longer be written cannot trap the user.
  // Queued writes skip a discarded pending save.
  async function saveBeforeSwitch(): Promise<boolean> {
    if (await flushPendingSave()) {
      switchBlocked.current = false;
      return true;
    }
    if (switchBlocked.current) {
      switchBlocked.current = false;
      window.clearTimeout(saveTimer.current);
      unsavedSince.current = null;
      pendingSave.current = null;
      return true;
    }

    switchBlocked.current = true;
    onError(
      'Could not save the current folder. It remains open; choose a folder again to open it without saving these changes.',
    );

    return false;
  }

  const flushOnHide = useEffectEvent(() => {
    void flushPendingSave();
  });

  useEffect(() => {
    mounted.current = true;
    const onVisibility = () => {
      if (document.hidden) {
        flushOnHide();
      }
    };
    const onPageHide = () => flushOnHide();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.clearTimeout(saveTimer.current);
      mounted.current = false;
      if (pendingSave.current) {
        void writePendingSave(pendingSave.current);
      }
    };
  }, [writePendingSave]);

  async function exportSettings() {
    flushSync(commitDraft);
    const state = savedState.current;

    if (!folder || !canExport || !state) {
      return;
    }

    try {
      await exportBackup(createBackup(folder.name, state));
    } catch (err) {
      if (activeFolder.current !== folder || (err instanceof DOMException && err.name === 'AbortError')) {
        return;
      }

      onError('Could not export settings. Try exporting again.');
    }
  }

  return {
    storageStatus,
    flushPendingSave,
    saveBeforeSwitch,
    hasPendingSave: () => pendingSave.current !== null,
    canExport,
    exportSettings,
  };
}
