import { pngExtension, type FolderEntry, type LoadedScreenshot, type Screenshot } from '@/model/screenshot';

const DECODE_BATCH_SIZE = 4;

interface ImageSize {
  width: number;
  height: number;
}

export function createScreenshot({ file, id }: FolderEntry): Screenshot {
  return {
    id,
    name: id.replace(pngExtension, ''),
    url: URL.createObjectURL(file),
  };
}

async function decodeSize(file: Screenshot): Promise<ImageSize | null> {
  try {
    const image = new Image();
    image.src = file.url;
    await image.decode();

    const { naturalWidth: width, naturalHeight: height } = image;

    return width > 0 && height > 0 ? { width, height } : null;
  } catch {
    return null;
  }
}

const sizeKey = ({ width, height }: ImageSize) => `${width}x${height}`;

// The most common size is the reference, so one odd file cannot reject the rest.
// A tie goes to the size that appears first in the sorted list.
function referenceSize(sizes: (ImageSize | null)[]): string | undefined {
  const counts = new Map<string, number>();

  for (const size of sizes) {
    if (size) {
      counts.set(sizeKey(size), (counts.get(sizeKey(size)) ?? 0) + 1);
    }
  }

  const most = Math.max(0, ...counts.values());

  return sizes.map((size) => size && sizeKey(size)).find((key) => key && counts.get(key) === most) ?? undefined;
}

export async function loadScreenshots(files: Screenshot[], isCurrent: () => boolean, reject: (url: string) => void) {
  const order = new Intl.Collator('en', { numeric: true });
  const sorted = [...files].sort((a, b) => order.compare(a.id, b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const sizes: (ImageSize | null)[] = [];

  for (let offset = 0; offset < sorted.length; offset += DECODE_BATCH_SIZE) {
    if (!isCurrent()) {
      return null;
    }

    sizes.push(...(await Promise.all(sorted.slice(offset, offset + DECODE_BATCH_SIZE).map(decodeSize))));

    if (!isCurrent()) {
      return null;
    }
  }

  const reference = referenceSize(sizes);
  const loaded: LoadedScreenshot[] = [];
  const failed: string[] = [];

  sorted.forEach((file, index) => {
    const size = sizes[index];

    if (size && sizeKey(size) === reference) {
      loaded.push({ ...file, ...size, number: loaded.length + 1 });
    } else {
      failed.push(file.id);
      reject(file.url);
    }
  });

  return { loaded, failed };
}
