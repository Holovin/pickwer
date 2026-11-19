import { Archive, Eye, Layers, X } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import type { OpenFolderModel } from '@/hooks/useOpenFolder';
import type { useFolderPersistence } from '@/hooks/useFolderPersistence';
import type { ScreenshotListModel } from '@/hooks/useScreenshotList';
import { describeStorageStatus } from '@/model/storageStatus';

interface ViewerSidebarProps {
  sidebar: RefObject<HTMLElement | null>;
  list: ScreenshotListModel;
  folder: OpenFolderModel;
  persistence: ReturnType<typeof useFolderPersistence>;
  error: string;
  onDismissError: () => void;
  children: ReactNode;
}

export function ViewerSidebar({
  sidebar,
  list,
  folder,
  persistence,
  error,
  onDismissError,
  children,
}: ViewerSidebarProps) {
  const { controls, filter, changeVisibility } = list;
  const { folderInput, chooseFolder, importFiles, busy } = folder;
  const { storageStatus, canExport, exportSettings } = persistence;

  return (
    <aside className="sidebar" ref={sidebar} tabIndex={-1}>
      <div className="sidebar-toolbar">
        <button type="button" className="choose-folder" onClick={chooseFolder}>
          {busy ? 'Loading…' : 'Choose folder'}
        </button>
        <fieldset className="visibility-switch" aria-label="File visibility">
          <button
            type="button"
            aria-label="Include hidden files"
            title="All files"
            aria-pressed={filter === 'all'}
            onClick={() => changeVisibility('all')}
          >
            <Layers size={18} />
          </button>
          <button
            type="button"
            aria-label="Include stash"
            title="Normal and stashed files"
            aria-pressed={filter === 'stash'}
            onClick={() => changeVisibility('stash')}
          >
            <Archive size={18} />
          </button>
          <button
            type="button"
            aria-label="Visible files only"
            title="Normal files only"
            aria-pressed={filter === 'normal'}
            onClick={() => changeVisibility('normal')}
          >
            <Eye size={18} />
          </button>
        </fieldset>
      </div>
      <div className="controls-frame">
        <div className="controls" ref={controls}>
          <input
            ref={(node) => {
              folderInput.current = node;

              if (node) {
                node.webkitdirectory = true;
              }
            }}
            type="file"
            multiple
            accept="image/png,application/json,.json"
            onChange={importFiles}
            hidden
            aria-label="Screenshot folder"
          />
          {canExport && (
            <button type="button" onClick={exportSettings}>
              Export settings
            </button>
          )}
          {children}
        </div>
      </div>
      <div className="message">
        <p className="message-text" role="alert">
          {error}
        </p>
        {error && (
          <button type="button" className="message-close" aria-label="Dismiss message" onClick={onDismissError}>
            <X size={16} />
          </button>
        )}
      </div>
      <div className="settings-status" role="status">
        <span>{busy ? 'Opening…' : describeStorageStatus(storageStatus)}</span>
      </div>
    </aside>
  );
}
