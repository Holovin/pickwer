import type { SavedState, SettingsBackup } from '@/model/settings';
import { validateState } from '@/storage/validation';

export const settingsFilename = 'screenshot-compare-settings.json';

export function parseBackup(text: string): SettingsBackup {
  const value = JSON.parse(text);

  if (value?.format !== 'screenshot-compare' || value.version !== 1 || typeof value.folder !== 'string') {
    throw new Error('Invalid settings file.');
  }

  const state = validateState(value.state);

  if (!state) {
    throw new Error('Invalid folder settings.');
  }

  return { format: 'screenshot-compare', version: 1, folder: value.folder, state };
}

export function createBackup(folder: string, state: SavedState): SettingsBackup {
  return { format: 'screenshot-compare', version: 1, folder, state };
}

async function writeBackup(file: FileSystemFileHandle, backup: SettingsBackup) {
  const writable = await file.createWritable();

  try {
    await writable.write(JSON.stringify(backup, null, 2));
    await writable.close();
  } catch (error) {
    try {
      await writable.abort();
    } catch {
      /* The stream may already be closed. */
    }
    throw error;
  }
}

export async function writeBackupToDirectory(backup: SettingsBackup, directory: FileSystemDirectoryHandle) {
  await writeBackup(await directory.getFileHandle(settingsFilename, { create: true }), backup);
}

export async function exportBackup(backup: SettingsBackup) {
  const picker = (
    window as Window & {
      showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker;

  if (picker) {
    const handle = await picker.call(window, {
      suggestedName: settingsFilename,
      types: [{ description: 'JSON settings', accept: { 'application/json': ['.json'] } }],
    });
    await writeBackup(handle, backup);
  } else {
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = settingsFilename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
