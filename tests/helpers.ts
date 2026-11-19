import { afterEach, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';

export function required<T>(value: T | null | undefined): T {
  if (value == null) {
    throw new Error('Expected a value in the test fixture');
  }
  return value;
}

export function getElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

const missingMethods = (['createObjectURL', 'revokeObjectURL'] as const).filter((method) => !(method in URL));
beforeAll(() => {
  for (const method of missingMethods) {
    Object.defineProperty(URL, method, { configurable: true, writable: true, value: () => {} });
  }
});
afterAll(() => {
  for (const method of missingMethods) {
    Reflect.deleteProperty(URL, method);
  }
});

beforeEach(() => {
  localStorage.clear();
  const records = new Map<string, unknown>();
  const database = {
    close() {},
    transaction() {
      const transaction = {
        oncomplete: null as (() => void) | null,
        objectStore() {
          return {
            get(id: string) {
              const result = { result: records.get(id) };
              Promise.resolve().then(() => transaction.oncomplete?.());
              return result;
            },
            getAll() {
              const result = { result: [...records.values()] };
              Promise.resolve().then(() => transaction.oncomplete?.());
              return result;
            },
            put(record: { id: string }) {
              records.set(record.id, record);
              Promise.resolve().then(() => transaction.oncomplete?.());
            },
          };
        },
      };
      return transaction;
    },
  };
  vi.stubGlobal('indexedDB', {
    open() {
      const request = { result: database, onsuccess: null as (() => void) | null };
      Promise.resolve().then(() => request.onsuccess?.());
      return request;
    },
  });
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 1206;
      naturalHeight = 2622;
      decode() {
        return Promise.resolve();
      }
    },
  );
  let sequence = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test-${sequence++}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.stubGlobal(
    'DragEvent',
    class extends MouseEvent {
      dataTransfer: DataTransfer | null;
      constructor(type: string, init: DragEventInit = {}) {
        super(type, init);
        this.dataTransfer = init.dataTransfer ?? null;
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

export async function load(names = ['c', 'a', 'b'], physicalPath = 'selected-files') {
  mockDirectory(null, names, physicalPath);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Choose folder|Loading…/ }));
  });
}

export const names = () => [...document.querySelectorAll('.file-name')].map((e) => e.textContent);
export const current = () => screen.getAllByRole('img')[0].getAttribute('alt');

export function mockDirectory(json: string | null, files = ['a'], physicalPath = 'shots') {
  const write = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  const handle = {
    name: physicalPath.slice(physicalPath.lastIndexOf('/') + 1),
    kind: 'directory',
    physicalPath,
    async isSameEntry(other: { physicalPath: string }) {
      return other.physicalPath === physicalPath;
    },
    async *values() {
      for (const name of files) {
        yield {
          kind: 'file',
          name: `${name}.png`,
          getFile: async () => new File(['png'], `${name}.png`, { type: 'image/png' }),
        };
      }
    },
    getFileHandle: vi.fn(async (_name: string, options?: { create?: boolean }) => {
      if (options?.create) {
        return { createWritable: async () => ({ write, close }) };
      }
      if (json === null) {
        throw new DOMException('Missing', 'NotFoundError');
      }
      return { getFile: async () => ({ text: async () => json, lastModified: 1000 }) };
    }),
  };
  const picker = vi.fn().mockResolvedValue(handle);
  vi.stubGlobal('showDirectoryPicker', picker);
  return { write, close, handle };
}
