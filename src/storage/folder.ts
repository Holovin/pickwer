import { pngExtension, type FolderEntry } from '@/model/screenshot';

export interface PickedFolder {
  name: string;
  handle: FileSystemDirectoryHandle | null;
  files: FolderEntry[];
}

type DirectoryPicker = (options: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;

type ReadableDirectory = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
};

// Dot directories such as .git hold tool data, not screenshots.
const isHiddenDirectory = (name: string) => name.startsWith('.');

async function readPngFiles(directory: FileSystemDirectoryHandle, prefix: string): Promise<FolderEntry[]> {
  const reads: Promise<FolderEntry[]>[] = [];

  for await (const entry of (directory as ReadableDirectory).values()) {
    if (entry.kind === 'directory') {
      if (!isHiddenDirectory(entry.name)) {
        reads.push(readPngFiles(entry, `${prefix}${entry.name}/`));
      }
    } else if (pngExtension.test(entry.name)) {
      reads.push(entry.getFile().then((file) => [{ file, id: prefix + entry.name }]));
    }
  }

  return (await Promise.all(reads)).flat();
}

export async function pickScreenshotFolder(): Promise<PickedFolder | null> {
  const picker = (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;

  if (!picker) {
    return null;
  }

  const handle = await picker.call(window, { mode: 'readwrite' });

  return { name: handle.name, handle, files: await readPngFiles(handle, '') };
}

export function inputFolder(files: File[]): PickedFolder {
  return {
    name: files[0]?.webkitRelativePath?.split('/')[0] || 'selected-files',
    handle: null,
    files: files
      .map((file) => {
        const path = file.webkitRelativePath;

        return { file, id: path ? path.slice(path.indexOf('/') + 1) : file.name };
      })
      .filter(({ id }) => !id.split('/').slice(0, -1).some(isHiddenDirectory)),
  };
}
