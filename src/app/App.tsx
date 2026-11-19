import { LucideProvider } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { NoteInput, type NoteInputHandle } from '@/components/NoteInput';
import { ComparisonView } from '@/components/ComparisonView';
import { ViewerSidebar } from '@/components/ViewerSidebar';
import { ScreenshotList } from '@/components/ScreenshotList';
import { useFolderPersistence, type OpenedFolder } from '@/hooks/useFolderPersistence';
import { useViewerShortcuts, useHeldPreview } from '@/hooks/useViewerShortcuts';
import { useScreenshotList } from '@/hooks/useScreenshotList';
import { useConfirmation } from '@/hooks/useConfirmation';
import { useOpenFolder } from '@/hooks/useOpenFolder';
import { flagsFromFilter } from '@/model/visibility';

const markLabel = { hidden: ' (hidden)', stashed: ' (stash)' } as const;

export default function App() {
  const [openedFolder, setOpenedFolder] = useState<OpenedFolder | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const note = useRef<NoteInputHandle>(null);
  const sidebar = useRef<HTMLElement>(null);
  const stage = useRef<HTMLElement>(null);

  const { pending, cancel: cancelConfirmation, confirm } = useConfirmation();
  const preview = useHeldPreview();
  const { heldPreview, clearHeldPreview } = preview;

  function clearPreview() {
    clearHeldPreview();
    setHoveredId(null);
  }

  const list = useScreenshotList(
    () => {
      clearPreview();
      cancelConfirmation();
    },
    () => stage.current?.focus({ preventScroll: true }),
  );
  const { files, selected, active, marks, filter, moveItem, browse, toggleHidden, changeVisibility, undoHidden } = list;

  useViewerShortcuts({
    preview,
    count: selected.length,
    note,
    sidebar,
    cancelConfirmation,
    clearHover: () => setHoveredId(null),
    onBrowse: browse,
    onReorder: (direction) => moveItem(active, active + direction),
    onFilter: changeVisibility,
    onUndo: undoHidden,
    onToggle: (action) => {
      const id = selected[active]?.id;

      if (!id) {
        return;
      }

      clearPreview();

      if (confirm(id, action)) {
        toggleHidden(active, action);
      }
    },
  });

  const hoveredIndex = selected.findIndex((file) => file.id === hoveredId);
  const previewing = heldPreview !== null || hoveredIndex >= 0;
  const displayed = heldPreview ?? (hoveredIndex >= 0 ? hoveredIndex : active);
  const current = selected[displayed];
  const currentMark = current && marks.get(current.id);
  const currentTitle = current ? current.name + (currentMark ? markLabel[currentMark] : '') : undefined;
  const base = selected[0];

  const folderFiles = useMemo(
    () =>
      files.map((file) => ({
        id: file.id,
        number: file.number,
        hidden: marks.get(file.id) === 'hidden',
        stashed: marks.get(file.id) === 'stashed',
        note: notes[file.id] ?? '',
      })),
    [files, marks, notes],
  );

  const persistence = useFolderPersistence({
    folder: openedFolder,
    files: folderFiles,
    activeId: selected[active]?.id,
    ...flagsFromFilter(filter),
    commitDraft: () => note.current?.commit(),
    onError: setError,
  });

  const folder = useOpenFolder({
    saveBeforeSwitch: persistence.saveBeforeSwitch,
    hasPendingSave: persistence.hasPendingSave,
    onError: setError,
    onReset() {
      list.resetList();
      setOpenedFolder(null);
      setNotes({});
    },
    onOpen(folder, loaded) {
      const saved = folder.restored;

      list.restoreList(loaded, saved);
      setNotes(Object.fromEntries((saved?.files ?? []).map((file) => [file.id, file.note])));
      setOpenedFolder(folder);
      stage.current?.focus({ preventScroll: true });
    },
  });

  return (
    <LucideProvider strokeWidth={1.75}>
      <div className="app">
        <ViewerSidebar
          sidebar={sidebar}
          list={list}
          folder={folder}
          persistence={persistence}
          error={error}
          onDismissError={() => setError('')}
        >
          <ScreenshotList
            list={list}
            pending={pending}
            previewIndex={previewing ? displayed : null}
            notes={notes}
            onHover={setHoveredId}
          />
        </ViewerSidebar>
        <ComparisonView
          stage={stage}
          current={current}
          base={base}
          details={
            <div className="file-details">
              <div className="current" title={currentTitle}>
                {current ? <span>{currentTitle}</span> : <span>Preview</span>}
              </div>
              {current && (
                <NoteInput
                  key={current.id}
                  handle={note}
                  value={notes[current.id] ?? ''}
                  onCommit={(value) => {
                    if (folder.isCurrentFolder()) {
                      setNotes((previous) => ({ ...previous, [current.id]: value }));
                    }
                  }}
                />
              )}
            </div>
          }
          onError={setError}
        />
      </div>
    </LucideProvider>
  );
}
