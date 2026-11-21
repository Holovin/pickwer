import { useFolderPersistence, type OpenedFolder } from '@/hooks/useFolderPersistence';
import { describeStorageStatus } from '@/model/storageStatus';
import type { SavedFile } from '@/model/settings';
import { expect, test, vi } from 'vitest';
import { act, fireEvent, renderHook, render, screen, waitFor } from '@testing-library/react';
import { required, load, mockDirectory, names, current } from './helpers';
import { identifyDirectory } from '@/storage/identity';
import { storageKey } from '@/storage/local';
import App from '@/app/App';

test('reopening a folder restores hidden files, order, active image and zoom after external deletion', async () => {
  const first = render(<App />, { reactStrictMode: true });
  await load();
  fireEvent.click(screen.getByRole('button', { name: 'Hide b' }));
  fireEvent.keyDown(window, { key: 'ArrowDown' });
  fireEvent.keyDown(window, { key: 'ArrowUp', metaKey: true });
  fireEvent.change(screen.getByRole('combobox', { name: 'Custom zoom: Left viewer' }), {
    target: { value: '0.5' },
  });
  first.unmount();
  render(<App />, { reactStrictMode: true });
  await load(['c', 'b']);
  await waitFor(() => expect(names()).toEqual(['c']));
  expect(document.querySelector('.badge-number')?.textContent).toBe('3');
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Custom zoom: Left viewer' }).value).toBe('0.5');

  fireEvent.click(screen.getByRole('button', { name: 'Include hidden files' }));
  expect(names()).toEqual(['c', 'b']);
  expect(document.querySelector('.hidden-file .file-name')?.textContent).toBe('b');
});

test('different folder identity does not inherit hidden state', async () => {
  render(<App />, { reactStrictMode: true });
  await load(['a']);
  fireEvent.click(screen.getByRole('button', { name: 'Hide a' }));
  await load(['a'], 'other/selected-files');
  await waitFor(() => expect(current()).toBe('a'));
  expect(names()).toEqual(['a']);

  await load(['a']);
  expect(names()).toEqual([]);

  // A slower, earlier directory scan must not replace the latest chosen folder.
  let finishScan!: () => void;
  const slow = mockDirectory(null, ['old'], 'slow/selected-files');
  const scan = new Promise<void>((resolve) => {
    finishScan = resolve;
  });
  slow.handle.values = async function* () {
    await scan;
    yield {
      kind: 'file',
      name: 'old.png',
      getFile: async () => new File(['png'], 'old.png', { type: 'image/png' }),
    };
  };
  fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
  await load(['latest'], 'new/selected-files');
  await act(async () => {
    finishScan();
    await scan;
  });
  expect(names()).toEqual(['latest']);
});

test('opening a directory restores JSON and saves only after ten seconds without changes', async () => {
  vi.useFakeTimers();
  const { write } = mockDirectory(
    JSON.stringify({
      format: 'screenshot-compare',
      version: 1,
      folder: 'shots',
      state: {
        version: 1,
        pathFormat: 'relative-v1',
        updatedAt: 10,
        files: [{ id: 'a.png', number: 1, hidden: true, stashed: false, note: 'From disk' }],
        showHidden: true,
        showStash: false,
        activeId: 'a.png',
      },
    }),
  );
  try {
    const app = render(<App />, { reactStrictMode: true });
    fireEvent.change(screen.getByRole('combobox', { name: 'Custom zoom: Left viewer' }), {
      target: { value: '0.6' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
    });
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'File note' }).value).toBe('From disk');
    expect(document.querySelector('.hidden-file')).not.toBeNull();
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Custom zoom: Left viewer' }).value).toBe('0.6');
    expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('50');
    expect(screen.getByRole('status').textContent).toBe('No pending changes');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(write).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('No pending changes');

    const note = screen.getByRole('textbox', { name: 'File note' });
    fireEvent.change(note, { target: { value: 'Updated' } });
    await act(async () => {
      fireEvent.blur(note);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(write).not.toHaveBeenCalled();

    fireEvent.change(note, { target: { value: 'Final note' } });
    fireEvent.blur(note);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9999);
    });
    expect(write).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(write).toHaveBeenCalledTimes(1);

    const saved = JSON.parse(required(write.mock.lastCall)[0]);
    expect(saved).not.toHaveProperty('viewer');
    expect(saved.state.files[0].note).toBe('Final note');
    expect(screen.getByRole('status').textContent).toContain('Saved ·');

    fireEvent.change(note, { target: { value: 'Newer than disk' } });
    fireEvent.blur(note);
    // Closing before the debounce finishes must not discard the local revision.
    app.unmount();
    render(<App />, { reactStrictMode: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
    });
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'File note' }).value).toBe('Newer than disk');
    expect(screen.getByRole('status').textContent).toContain('Unsaved changes');
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Custom zoom: Left viewer' }).value).toBe('0.6');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(JSON.parse(required(write.mock.lastCall)[0]).state.files[0].note).toBe('Newer than disk');

    let finishWrite!: () => void;
    const pendingWrite = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    write.mockImplementationOnce(() => pendingWrite);
    const currentNote = screen.getByRole('textbox', { name: 'File note' });
    fireEvent.change(currentNote, { target: { value: 'Writing' } });
    fireEvent.blur(currentNote);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    fireEvent.change(currentNote, { target: { value: 'Still pending' } });
    fireEvent.blur(currentNote);
    await act(async () => {
      finishWrite();
      await pendingWrite;
    });
    expect(screen.getByRole('status').textContent).toContain('Unsaved changes');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(JSON.parse(required(write.mock.lastCall)[0]).state.files[0].note).toBe('Still pending');
  } finally {
    vi.useRealTimers();
  }
});

test('missing JSON restores verified local settings and corrupt JSON is never overwritten', async () => {
  vi.useFakeTimers();
  const missing = mockDirectory(null);
  const identity = await identifyDirectory(missing.handle as unknown as FileSystemDirectoryHandle);
  localStorage.setItem(
    storageKey(identity.key),
    JSON.stringify({
      version: 1,
      pathFormat: 'relative-v1',
      updatedAt: 10,
      files: [{ id: 'a.png', number: 1, hidden: false, stashed: false, note: 'Keep me' }],
      showHidden: false,
      showStash: false,
    }),
  );
  try {
    const app = render(<App />, { reactStrictMode: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
    });
    expect(missing.write).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(JSON.parse(missing.write.mock.calls[0][0]).state.files[0].note).toBe('Keep me');

    app.unmount();
    const corrupt = mockDirectory('{broken');
    render(<App />, { reactStrictMode: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
    });
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'File note' }).value).toBe('Keep me');
    expect(corrupt.write).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('autosave paused');

    vi.stubGlobal('indexedDB', undefined);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
    });
    const exportWrite = vi.fn();
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn(async () => ({
        createWritable: async () => ({ write: exportWrite, close: async () => {} }),
      })),
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'File note' }), {
      target: { value: 'Recovered draft' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export settings' }));
    });
    expect(JSON.parse(exportWrite.mock.calls[0][0]).state.files[0].note).toBe('Recovered draft');
    expect(corrupt.write).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

test('a folder without an identity cache writes committed edits immediately', async () => {
  vi.stubGlobal('indexedDB', undefined);
  const { write } = mockDirectory(null);
  render(<App />, { reactStrictMode: true });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
  });
  expect(write).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Hide a' }));
  });
  expect(write).toHaveBeenCalledTimes(1);
  expect(JSON.parse(write.mock.calls[0][0]).state.files[0].hidden).toBe(true);

  const request = vi.fn().mockRejectedValue(new DOMException('Denied', 'SecurityError'));
  vi.stubGlobal('navigator', Object.create(navigator, { locks: { value: { request } } }));
  const next = mockDirectory(null, ['b'], 'next');
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
  });
  expect(request).toHaveBeenCalledOnce();
  expect(current()).toBe('b');

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Hide b' }));
  });
  expect(next.write).toHaveBeenCalledOnce();
});

test('reopening a folder after months of inactivity keeps its identity and cached note', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 0, 1));
  const first = render(<App />, { reactStrictMode: true });
  await load(['a']);
  const note = screen.getByRole('textbox', { name: 'File note' });
  fireEvent.change(note, { target: { value: 'Keep this note' } });
  fireEvent.blur(note);
  first.unmount();
  clock.mockReturnValue(Date.UTC(2026, 5, 1));
  render(<App />, { reactStrictMode: true });
  await load(['a']);
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'File note' }).value).toBe('Keep this note');
});

test('reset cancels deferred saves and ignores completion from a previous folder', async () => {
  vi.useFakeTimers();
  const directory = mockDirectory(null, ['a']);
  const opened: OpenedFolder = {
    key: 'test-folder',
    name: 'shots',
    directory: directory.handle as unknown as FileSystemDirectoryHandle,
    persistent: true,
    writable: true,
    recoverLocal: false,
    restored: null,
  };
  const file: SavedFile = { id: 'a.png', number: 1, hidden: false, stashed: false, note: '' };
  const defaults = { showHidden: false, showStash: false, activeId: 'a.png', onError: vi.fn(), commitDraft: vi.fn() };
  const { result, rerender } = renderHook(
    ({ folder, files }: { folder: OpenedFolder | null; files: SavedFile[] }) =>
      useFolderPersistence({ ...defaults, folder, files }),
    { initialProps: { folder: opened as OpenedFolder | null, files: [file] }, reactStrictMode: true },
  );
  rerender({ folder: opened, files: [{ ...file, note: 'edited' }] });
  expect(describeStorageStatus(result.current.storageStatus)).toContain('Unsaved changes');
  rerender({ folder: null, files: [] });
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(directory.write).not.toHaveBeenCalled();
  expect(describeStorageStatus(result.current.storageStatus)).toBe('No folder open');

  rerender({ folder: opened, files: [file] });
  rerender({ folder: opened, files: [{ ...file, note: 'edited again' }] });
  let failWrite!: () => void;
  directory.write.mockImplementationOnce(
    () =>
      new Promise<void>((_, reject) => {
        failWrite = () => reject(new Error('Failed'));
      }),
  );
  let flushed!: Promise<boolean>;
  await act(async () => {
    flushed = result.current.flushPendingSave();
  });
  expect(describeStorageStatus(result.current.storageStatus)).toBe('Saving…');
  rerender({ folder: null, files: [] });
  await act(async () => {
    failWrite();
    await flushed;
  });
  expect(describeStorageStatus(result.current.storageStatus)).toBe('No folder open');
  expect(result.current.canExport).toBe(false);
});

test('continuous activity still saves within 30 seconds of the first unsaved change', async () => {
  vi.useFakeTimers();
  const { write } = mockDirectory(null, ['a', 'b', 'c']);
  render(<App />, { reactStrictMode: true });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
  });

  for (let step = 0; step < 6; step++) {
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
  }
  expect(write).toHaveBeenCalledTimes(1);

  fireEvent.keyDown(window, { key: 'ArrowDown' });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(9999);
  });
  expect(write).toHaveBeenCalledTimes(1);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(write).toHaveBeenCalledTimes(2);
});
