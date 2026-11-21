// A screenshot is normal, hidden or stashed; a single mark keeps the states exclusive.
export type Mark = 'hidden' | 'stashed';

export type VisibilityFilter = 'normal' | 'stash' | 'all';

export type Marks = ReadonlyMap<string, Mark>;

export function isVisible(mark: Mark | undefined, filter: VisibilityFilter): boolean {
  return filter === 'all' || !mark || (filter === 'stash' && mark === 'stashed');
}

export function filterFromFlags(showHidden: boolean, showStash: boolean): VisibilityFilter {
  if (showHidden) {
    return 'all';
  }

  return showStash ? 'stash' : 'normal';
}

export function flagsFromFilter(filter: VisibilityFilter) {
  return { showHidden: filter === 'all', showStash: filter === 'stash' };
}

export function markFromFlags({ hidden, stashed }: { hidden: boolean; stashed: boolean }): Mark | undefined {
  if (hidden) {
    return 'hidden';
  }

  return stashed ? 'stashed' : undefined;
}

export function withMark(marks: Marks, id: string, mark: Mark | undefined): Marks {
  const next = new Map(marks);

  if (mark) {
    next.set(id, mark);
  } else {
    next.delete(id);
  }

  return next;
}
