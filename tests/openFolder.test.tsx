import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import App from '@/app/App';
import { identifyDirectory } from '@/storage/identity';
import { current, mockDirectory, names } from './helpers';

const choose = () => fireEvent.click(screen.getByRole('button', { name: /Choose folder|Loading…/ }));

test('corrupt settings, unavailable cache and rejected PNGs are all reported together', async () => {
  mockDirectory('not JSON', ['shot']);
  vi.stubGlobal('indexedDB', undefined);
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 20;
      naturalHeight = 0;
      async decode() {}
    },
  );
  render(<App />, { reactStrictMode: true });
  await act(async () => {
    choose();
  });

  expect(screen.getByRole('status').textContent).toContain('JSON unreadable');
  const message = screen.getByRole('alert').textContent;
  expect(message).toContain('Could not read settings JSON');
  expect(message).toContain('local cache is disabled');
  expect(message).toContain('shot.png');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(vi.mocked(URL.createObjectURL).mock.results[0].value);
});

test('both folder pickers order and identify same-name files by their relative paths', async () => {
  function imageFolder(name: string) {
    return {
      kind: 'directory',
      name,
      async *values() {
        yield { kind: 'file', name: 'shot.png', getFile: async () => Object.freeze(new File(['png'], 'shot.png')) };
      },
    };
  }
  vi.stubGlobal(
    'showDirectoryPicker',
    vi.fn().mockResolvedValue({
      name: 'root',
      async *values() {
        yield imageFolder('b');
        yield imageFolder('a');
      },
      getFileHandle: async () => {
        throw new DOMException('Missing', 'NotFoundError');
      },
    }),
  );
  render(<App />, { reactStrictMode: true });
  await act(async () => {
    choose();
  });
  expect(names()).toEqual(['a/shot', 'b/shot']);

  const files = ['b', 'a', 'c'].map((directory) => {
    const file = new File(['png'], 'shot.png');
    Object.defineProperty(file, 'webkitRelativePath', { value: `root/${directory}/shot.png` });
    return file;
  });
  vi.mocked(URL.createObjectURL).mockImplementation((blob) => `blob:${(blob as File).webkitRelativePath}`);
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      naturalWidth = 20;
      naturalHeight = 20;
      async decode() {
        if (this.src.includes('/c/')) {
          throw new Error('Bad PNG');
        }
      }
    },
  );
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Screenshot folder'), { target: { files } });
  });
  expect(names()).toEqual(['a/shot', 'b/shot']);
  expect(screen.getByRole('alert').textContent).toContain('c/shot.png');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:root/c/shot.png');
});

test.each(['empty', 'exception'])('superseded decode cannot replace a newer %s selection', async (mode) => {
  let finishDecode!: () => void;
  const decode = new Promise<void>((resolve) => {
    finishDecode = resolve;
  });
  vi.spyOn(Image.prototype, 'decode').mockReturnValue(decode);
  mockDirectory(null, ['old']);
  render(<App />, { reactStrictMode: true });
  await act(async () => {
    choose();
  });
  expect(Image.prototype.decode).toHaveBeenCalledOnce();

  if (mode === 'empty') {
    mockDirectory(null, []);
  } else {
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => {
      throw new Error('Unavailable');
    });
  }
  await act(async () => {
    if (mode === 'empty') {
      choose();
    } else {
      fireEvent.change(screen.getByLabelText('Screenshot folder'), { target: { files: [new File([''], 'new.png')] } });
    }
  });
  expect(screen.getByRole('button', { name: 'Choose folder' })).toBeTruthy();
  const message = screen.getByRole('alert').textContent;
  expect(message).toContain(mode === 'empty' ? 'No PNG files' : 'Could not open the folder');
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();

  await act(async () => {
    finishDecode();
  });
  expect(names()).toEqual([]);
  expect(screen.getByRole('alert').textContent).toBe(message);
});

test('a broken registry entry does not mask a later matching directory', async () => {
  const first = mockDirectory(null, [], 'broken').handle;
  const second = mockDirectory(null, [], 'valid').handle;
  const register = (handle: typeof first) => identifyDirectory(handle as unknown as FileSystemDirectoryHandle);
  await register(first);
  const identity = await register(second);
  await register(mockDirectory(null, [], 'third').handle);
  const reopened = mockDirectory(null, [], 'valid').handle;
  vi.spyOn(reopened, 'isSameEntry').mockImplementation(async (other) => {
    if (other.physicalPath === 'broken') {
      throw new DOMException('Missing', 'NotFoundError');
    }
    return other.physicalPath === 'valid';
  });
  expect(await register(reopened)).toEqual(identity);
  expect(identity.persistent).toBe(true);
  expect(reopened.isSameEntry).toHaveBeenCalledWith(first);
  vi.mocked(reopened.isSameEntry).mockClear();
  expect(await register(reopened)).toEqual(identity);
  expect(reopened.isSameEntry).toHaveBeenCalledTimes(1);
});

test('the most common size is the reference even when the first file differs', async () => {
  mockDirectory(null, ['a-thumbnail', 'b', 'c']);
  vi.mocked(URL.createObjectURL).mockImplementation((blob) => `blob:${(blob as File).name}`);
  vi.stubGlobal(
    'Image',
    class {
      src = '';

      get naturalWidth() {
        return this.src.includes('thumbnail') ? 200 : 1206;
      }

      get naturalHeight() {
        return this.src.includes('thumbnail') ? 100 : 2622;
      }

      async decode() {}
    },
  );
  render(<App />, { reactStrictMode: true });
  await act(async () => {
    choose();
  });

  expect(names()).toEqual(['b', 'c']);
  expect(screen.getByRole('alert').textContent).toContain('a-thumbnail.png');

  fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
  expect(screen.getByRole('alert').textContent).toBe('');
  expect(screen.queryByRole('button', { name: 'Dismiss message' })).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a-thumbnail.png');
});

test('a folder change is not committed while a newer selection replaces it', async () => {
  mockDirectory(null, ['old']);
  render(<App />, { reactStrictMode: true });
  await act(async () => {
    choose();
  });
  expect(names()).toEqual(['old']);

  let finishRead!: () => void;
  const next = mockDirectory(null, ['next']);
  next.handle.getFileHandle.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        finishRead = () => reject(new DOMException('Missing', 'NotFoundError'));
      }),
  );
  await act(async () => {
    choose();
  });
  expect(names()).toEqual(['old']);

  vi.stubGlobal('showDirectoryPicker', vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')));
  await act(async () => {
    choose();
  });
  await act(async () => {
    finishRead();
  });
  expect(names()).toEqual(['old']);
  expect(current()).toBe('old');
});

test('both folder pickers skip dot directories', async () => {
  function imageFolder(name: string) {
    return {
      kind: 'directory',
      name,
      async *values() {
        yield { kind: 'file', name: 'shot.png', getFile: async () => new File(['png'], 'shot.png') };
      },
    };
  }
  vi.stubGlobal(
    'showDirectoryPicker',
    vi.fn().mockResolvedValue({
      name: 'root',
      async *values() {
        yield imageFolder('.git');
        yield imageFolder('shots');
      },
      getFileHandle: async () => {
        throw new DOMException('Missing', 'NotFoundError');
      },
    }),
  );
  render(<App />, { reactStrictMode: true });
  await act(async () => {
    choose();
  });
  expect(names()).toEqual(['shots/shot']);

  const files = ['.cache', 'shots'].map((directory) => {
    const file = new File(['png'], 'shot.png');
    Object.defineProperty(file, 'webkitRelativePath', { value: `root/${directory}/shot.png` });
    return file;
  });
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Screenshot folder'), { target: { files } });
  });
  expect(names()).toEqual(['shots/shot']);
});
