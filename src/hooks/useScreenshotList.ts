import { useMemo, useRef, useState } from 'react';
import type { LoadedScreenshot } from '@/model/screenshot';
import type { SavedState } from '@/model/settings';
import {
  filterFromFlags,
  isVisible,
  markFromFlags,
  withMark,
  type Mark,
  type Marks,
  type VisibilityFilter,
} from '@/model/visibility';
import { useListTransitions } from '@/hooks/useListTransitions';

const UNDO_LIMIT = 3;

export type ToggleAction = 'hide' | 'stash';

const actionMark: Record<ToggleAction, Mark> = { hide: 'hidden', stash: 'stashed' };

function visibleFiles(files: LoadedScreenshot[], marks: Marks, filter: VisibilityFilter) {
  return files.filter((file) => isVisible(marks.get(file.id), filter));
}

function visibleIndex(files: LoadedScreenshot[], id: string | undefined, fallback: number) {
  const index = files.findIndex((file) => file.id === id);

  return index >= 0 ? index : Math.max(0, Math.min(fallback, files.length - 1));
}

export function useScreenshotList(clearPreview: () => void, focusViewer: () => void) {
  const [files, setFiles] = useState<LoadedScreenshot[]>([]);
  const [marks, setMarks] = useState<Marks>(new Map());
  const [filter, setFilter] = useState<VisibilityFilter>('normal');
  const selected = useMemo(() => visibleFiles(files, marks, filter), [files, marks, filter]);
  const [active, setActive] = useState(0);
  const history = useRef<{ id: string; mark?: Mark; activeId?: string }[]>([]);
  const {
    rowElements,
    controls,
    capturePositions,
    rememberScroll,
    recordRowPositions,
    alignRestoredToTop,
    resetTransitions,
  } = useListTransitions(selected, active);

  function moveItem(from: number, to: number) {
    if (from < 0 || from >= selected.length || to < 0 || to >= selected.length || from === to) {
      return;
    }

    clearPreview();
    recordRowPositions();
    const activeId = selected[active]?.id;
    const reordered = [...selected];
    reordered.splice(to, 0, reordered.splice(from, 1)[0]);
    const visibleIds = new Set(selected.map((file) => file.id));
    let cursor = 0;
    setFiles(files.map((file) => (visibleIds.has(file.id) ? reordered[cursor++] : file)));
    setActive(reordered.findIndex((f) => f.id === activeId));
  }

  function applyMark(id: string, mark: Mark | undefined, restoreId?: string) {
    const next = withMark(marks, id, mark);
    const visible = visibleFiles(files, next, filter);
    setActive(visibleIndex(visible, selected[active]?.id, visibleIndex(visible, restoreId, active)));
    setMarks(next);
  }

  function undoHidden() {
    const operation = history.current.pop();

    if (!operation) {
      return;
    }

    capturePositions();
    clearPreview();
    applyMark(operation.id, operation.mark, operation.activeId);
  }

  function toggleHidden(index: number, action: ToggleAction = 'hide') {
    const item = selected[index];

    if (!item) {
      return;
    }

    const mark = marks.get(item.id);
    history.current = [...history.current, { id: item.id, mark, activeId: selected[active]?.id }].slice(-UNDO_LIMIT);
    capturePositions();
    clearPreview();
    applyMark(item.id, mark === actionMark[action] ? undefined : actionMark[action]);
    focusViewer();
  }

  function changeVisibility(next: VisibilityFilter) {
    if (next === filter) {
      return;
    }

    capturePositions();
    clearPreview();
    const nextVisible = visibleFiles(files, marks, next);
    const nextActive = visibleIndex(nextVisible, selected[active]?.id, 0);
    rememberScroll(nextVisible[nextActive]?.id);
    setActive(nextActive);
    setFilter(next);
  }

  function resetList() {
    history.current = [];
    resetTransitions();
    setFiles([]);
    setActive(0);
    setMarks(new Map());
    setFilter('normal');
    clearPreview();
  }

  function restoreList(loaded: LoadedScreenshot[], saved: SavedState | null) {
    let restored = loaded;

    if (saved) {
      const order = new Map(saved.files.map((file, index) => [file.id, index]));
      const numbers = new Map(saved.files.map((file) => [file.id, file.number]));
      let lastNumber = Math.max(0, ...saved.files.map((file) => file.number));
      restored = loaded.map((file) => ({ ...file, number: numbers.get(file.id) ?? ++lastNumber }));
      restored.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
    }

    const savedMarks = new Map<string, Mark>();

    for (const file of saved?.files ?? []) {
      const mark = markFromFlags(file);

      if (mark) {
        savedMarks.set(file.id, mark);
      }
    }

    const savedFilter = saved ? filterFromFlags(saved.showHidden, saved.showStash) : 'normal';
    const visible = visibleFiles(restored, savedMarks, savedFilter);
    alignRestoredToTop.current = true;
    setFiles(restored);
    setMarks(savedMarks);
    setFilter(savedFilter);
    setActive(
      Math.max(
        0,
        visible.findIndex((file) => file.id === saved?.activeId),
      ),
    );
  }

  function browse(direction: number) {
    if (selected.length) {
      setActive((index) => (index + direction + selected.length) % selected.length);
    }
  }

  return {
    files,
    selected,
    active,
    setActive,
    marks,
    filter,
    controls,
    rowElements,
    moveItem,
    browse,
    toggleHidden,
    undoHidden,
    changeVisibility,
    resetList,
    restoreList,
  };
}

export type ScreenshotListModel = ReturnType<typeof useScreenshotList>;
