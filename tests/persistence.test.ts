import type { SettingsBackup } from '@/model/settings';
import { expect, test, vi } from 'vitest';
import { parseBackup, writeBackupToDirectory } from '@/storage/backup';
import { mergeFiles, stampState } from '@/storage/local';
import { filterFromFlags, flagsFromFilter, isVisible, markFromFlags } from '@/model/visibility';

const backup: SettingsBackup = {
  format: 'screenshot-compare',
  version: 1,
  folder: 'shots',
  state: {
    version: 1,
    pathFormat: 'relative-v1',
    updatedAt: 42,
    showStash: false,
    showHidden: true,
    activeId: 'a.png',
    files: [
      { id: 'b.png', number: 2, hidden: true, stashed: false, note: 'Less shadow' },
      { id: 'a.png', number: 1, hidden: false, stashed: false, note: '' },
    ],
  },
};

test('JSON round trip preserves notes, hidden state, order and selection', () => {
  expect(parseBackup(JSON.stringify(backup))).toEqual(backup);

  const replacement = { id: 'new.png', number: 3, hidden: false, stashed: false, note: '' };
  const replaced = {
    ...backup,
    state: { ...backup.state, files: mergeFiles(backup.state.files, [replacement]) },
  };
  expect(parseBackup(JSON.stringify(replaced)).state.files).toEqual([...backup.state.files, replacement]);
});

test('invalid or incomplete backups are rejected', () => {
  expect(() => parseBackup('invalid')).toThrow();
  expect(() => parseBackup(JSON.stringify({ ...backup, format: 'other' }))).toThrow();

  for (const field of ['pathFormat', 'updatedAt', 'showStash']) {
    expect(() => parseBackup(JSON.stringify({ ...backup, state: { ...backup.state, [field]: undefined } }))).toThrow();
  }
  for (const field of ['hidden', 'stashed', 'note']) {
    const incomplete = { ...backup.state.files[0], [field]: undefined };
    expect(() => parseBackup(JSON.stringify({ ...backup, state: { ...backup.state, files: [incomplete] } }))).toThrow();
  }
});

test('export writes the complete backup to the selected directory', async () => {
  const write = vi.fn().mockResolvedValue(undefined),
    close = vi.fn().mockResolvedValue(undefined);
  const createWritable = vi.fn().mockResolvedValue({ write, close });
  const getFileHandle = vi.fn().mockResolvedValue({ createWritable });
  await writeBackupToDirectory(backup, { getFileHandle } as unknown as FileSystemDirectoryHandle);
  expect(getFileHandle).toHaveBeenCalledWith('screenshot-compare-settings.json', { create: true });
  expect(JSON.parse(write.mock.calls[0][0])).toEqual(backup);
  expect(close).toHaveBeenCalledOnce();
});

test('reordering object keys preserves the revision, reordering files advances it', () => {
  const previous = backup.state;
  const files = previous.files.map(({ note, stashed, ...file }) => ({ note, stashed, ...file }));
  const state = { ...previous, files };
  expect(stampState(state, previous)).toBe(previous);
  expect(stampState({ ...state, files: [...files].reverse() }, previous).updatedAt).toBeGreaterThan(previous.updatedAt);
});

test.each(['write', 'close'] as const)(
  'aborts the stream when %s fails and preserves the original error',
  async (method) => {
    const stream = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockRejectedValue(new Error('Already closed')),
    };
    const error = new Error('Save failed');
    stream[method].mockRejectedValueOnce(error);
    const directory = {
      getFileHandle: async () => ({ createWritable: async () => stream }),
    } as unknown as FileSystemDirectoryHandle;
    await expect(writeBackupToDirectory(backup, directory)).rejects.toBe(error);
    expect(stream.abort).toHaveBeenCalledOnce();
  },
);

test('validation removes unknown fields and rejects empty or duplicate identifiers and numbers', () => {
  const parse = (files: unknown[]) =>
    parseBackup(JSON.stringify({ ...backup, state: { ...backup.state, extra: 1, files } })).state;
  const [a, b] = backup.state.files;
  expect(parse([{ ...a, extra: true }, b])).toEqual(backup.state);
  for (const invalid of [
    { ...b, id: '' },
    { ...b, id: a.id },
    { ...b, number: a.number },
  ]) {
    expect(() => parse([a, invalid])).toThrow();
  }
});

test('visibility flags map to a single filter and mark', () => {
  expect(filterFromFlags(true, true)).toBe('all');
  expect(filterFromFlags(false, true)).toBe('stash');
  expect(filterFromFlags(false, false)).toBe('normal');
  expect(flagsFromFilter('stash')).toEqual({ showHidden: false, showStash: true });
  expect(markFromFlags({ hidden: false, stashed: true })).toBe('stashed');
  expect(isVisible('stashed', 'stash')).toBe(true);
  expect(isVisible('hidden', 'stash')).toBe(false);
});
