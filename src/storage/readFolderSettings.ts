import type { FolderEntry } from '@/model/screenshot';
import type { SavedState } from '@/model/settings';
import { parseBackup, settingsFilename } from '@/storage/backup';
import { reconcileState } from '@/storage/local';

export interface FolderSettings {
  saved: SavedState | null;
  recoverLocal: boolean;
  writable: boolean;
  error?: string;
}

const readError = 'Could not read settings JSON. The file will not be overwritten.';

export async function readFolderSettings(
  handle: FileSystemDirectoryHandle | null,
  incoming: FolderEntry[],
  local: SavedState | null,
): Promise<FolderSettings> {
  if (!handle) {
    const json = incoming.find((entry) => entry.id === settingsFilename)?.file;
    const session = { saved: null, writable: false, recoverLocal: false };

    if (!json) {
      return session;
    }

    try {
      return { ...session, saved: parseBackup(await json.text()).state };
    } catch {
      return { ...session, error: readError };
    }
  }

  try {
    const fileHandle = await handle.getFileHandle(settingsFilename);
    const file = await fileHandle.getFile();
    const disk = parseBackup(await file.text()).state;
    const recoverLocal = local !== null && local.updatedAt > disk.updatedAt;

    return {
      saved: reconcileState(local, disk),
      recoverLocal,
      writable: true,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return {
        saved: local,
        recoverLocal: local !== null && local.updatedAt > 0,
        writable: true,
      };
    }

    return {
      saved: local,
      recoverLocal: false,
      writable: false,
      error: readError,
    };
  }
}
