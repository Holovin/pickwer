import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createScreenshot, loadScreenshots } from '@/model/loadScreenshots';
import { pngExtension, type LoadedScreenshot } from '@/model/screenshot';
import { pickScreenshotFolder, inputFolder, type PickedFolder } from '@/storage/folder';
import { identifyDirectory, sessionIdentity, type DirectoryIdentity } from '@/storage/identity';
import { readState } from '@/storage/local';
import { readFolderSettings, type FolderSettings } from '@/storage/readFolderSettings';
import type { OpenedFolder } from '@/hooks/useFolderPersistence';

interface OpenFolderOptions {
  saveBeforeSwitch: () => Promise<boolean>;
  hasPendingSave: () => boolean;
  onReset: () => void;
  onOpen: (folder: OpenedFolder, files: LoadedScreenshot[]) => void;
  onError: (message: string) => void;
}

type LoadResult = NonNullable<Awaited<ReturnType<typeof loadScreenshots>>>;

function release(urls: Set<string>) {
  for (const url of urls) {
    URL.revokeObjectURL(url);
  }
  urls.clear();
}

function openWarnings(settings: FolderSettings, identity: DirectoryIdentity, picked: PickedFolder, result: LoadResult) {
  const warnings = [settings.error];

  if (picked.handle && !identity.persistent) {
    warnings.push(
      'Directory identity storage is unavailable. Settings will restore from JSON; the local cache is disabled.',
    );
  }
  if (result.failed.length) {
    warnings.push(`Not added (corrupt files or different dimensions): ${result.failed.join(', ')}`);
  }

  return warnings.filter(Boolean).join(' ');
}

export function useOpenFolder({ saveBeforeSwitch, hasPendingSave, onReset, onOpen, onError }: OpenFolderOptions) {
  const folderInput = useRef<HTMLInputElement>(null);
  const displayed = useRef(new Set<string>());
  const pending = useRef<Set<string> | null>(null);
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      if (pending.current) {
        release(pending.current);
      }

      pending.current = null;
      release(displayed.current);
    },
    [],
  );

  async function decodePicked(picked: PickedFolder, urls: Set<string>, isCurrent: () => boolean) {
    const pngs = picked.files.filter((entry) => pngExtension.test(entry.id));

    if (!pngs.length) {
      onError('No PNG files found in the selected folder.');
      return null;
    }

    const screenshots = pngs.map((entry) => {
      const screenshot = createScreenshot(entry);
      urls.add(screenshot.url);
      return screenshot;
    });

    return loadScreenshots(screenshots, isCurrent, (url) => {
      URL.revokeObjectURL(url);
      urls.delete(url);
    });
  }

  // Keep the current folder until the new one is ready. Edits made while the
  // new folder's settings are read are saved before switching.
  async function settleCurrentFolder(picked: PickedFolder, identity: DirectoryIdentity, isCurrent: () => boolean) {
    let settings: FolderSettings;

    do {
      if (!(await saveBeforeSwitch()) || !isCurrent()) {
        return null;
      }

      const local = identity.persistent ? readState(identity.key) : null;
      settings = await readFolderSettings(picked.handle, picked.files, local);

      if (!isCurrent()) {
        return null;
      }
    } while (hasPendingSave());

    return settings;
  }

  function commitOpen(
    picked: PickedFolder,
    identity: DirectoryIdentity,
    settings: FolderSettings,
    result: LoadResult,
    urls: Set<string>,
  ) {
    generation.current++;
    onReset();
    release(displayed.current);
    displayed.current = new Set(urls);
    urls.clear();
    onOpen(
      {
        ...identity,
        name: picked.name,
        directory: picked.handle,
        restored: settings.saved,
        writable: settings.writable,
        recoverLocal: settings.recoverLocal,
      },
      result.loaded,
    );
    onError(openWarnings(settings, identity, picked, result));
  }

  async function select(read: () => PickedFolder | null | Promise<PickedFolder | null>) {
    if (pending.current) {
      release(pending.current);
    }

    const urls = new Set<string>();
    pending.current = urls;
    const isCurrent = () => pending.current === urls;
    setBusy(true);
    onError('');

    try {
      const picked = await read();

      if (!isCurrent()) {
        return;
      }
      if (!picked) {
        folderInput.current?.click();
        return;
      }

      const result = await decodePicked(picked, urls, isCurrent);

      if (!isCurrent() || !result) {
        return;
      }

      const identity = picked.handle ? await identifyDirectory(picked.handle) : sessionIdentity();

      if (!isCurrent()) {
        return;
      }

      const settings = await settleCurrentFolder(picked, identity, isCurrent);

      if (settings) {
        commitOpen(picked, identity, settings, result, urls);
      }
    } catch (error) {
      if (isCurrent() && !(error instanceof DOMException && error.name === 'AbortError')) {
        onError('Could not open the folder.');
      }
    } finally {
      release(urls);
      if (isCurrent()) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length) {
      return select(() => inputFolder(files));
    }
  }

  const openedGeneration = generation.current;

  return {
    folderInput,
    chooseFolder: () => select(pickScreenshotFolder),
    importFiles,
    busy,
    isCurrentFolder: () => openedGeneration === generation.current,
  };
}

export type OpenFolderModel = ReturnType<typeof useOpenFolder>;
