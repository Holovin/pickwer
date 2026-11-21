import { useRef, useLayoutEffect } from 'react';
import type { LoadedScreenshot } from '@/model/screenshot';

const ROW_ANIMATION_MS = 280;

function scrollRowIntoView(scroller: HTMLElement, row: HTMLElement, alignTop = false) {
  const viewport = scroller.getBoundingClientRect();
  const bounds = row.getBoundingClientRect();

  if (alignTop || bounds.top < viewport.top) {
    scroller.scrollTop += bounds.top - viewport.top;
  } else if (bounds.bottom > viewport.bottom) {
    scroller.scrollTop += bounds.bottom - viewport.bottom;
  }
}

export function useListTransitions(selected: LoadedScreenshot[], active: number) {
  const rowElements = useRef(new Map<string, HTMLLIElement>());
  const controls = useRef<HTMLDivElement>(null);
  const alignRestoredToTop = useRef(false);
  const scrollAnchor = useRef<{ id: string; top: number } | null>(null);
  const animateList = useRef(false);
  const previousPositions = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const anchor = scrollAnchor.current;
    scrollAnchor.current = null;
    const scroller = controls.current;
    const anchorRow = anchor && rowElements.current.get(anchor.id);

    if (anchor && scroller && anchorRow) {
      scroller.scrollTop += anchorRow.getBoundingClientRect().top - anchor.top;
      scrollRowIntoView(scroller, anchorRow);
    }

    const activeId = selected[active]?.id;
    const activeRow = activeId ? rowElements.current.get(activeId) : undefined;

    if (scroller && activeRow) {
      scrollRowIntoView(scroller, activeRow, alignRestoredToTop.current);
    }

    alignRestoredToTop.current = false;
    const previous = previousPositions.current;
    previousPositions.current = new Map();
    const animate = animateList.current;
    animateList.current = false;

    if ((!previous.size && !animate) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    rowElements.current.forEach((row, id) => {
      const oldTop = previous.get(id);

      if (oldTop === undefined) {
        row.animate?.(
          [
            { opacity: 0, transform: 'translateY(-8px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: ROW_ANIMATION_MS, easing: 'ease-out' },
        );
        return;
      }

      const delta = oldTop - row.getBoundingClientRect().top;

      if (Math.abs(delta) < 1) {
        return;
      }

      row.animate?.([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
        duration: ROW_ANIMATION_MS,
        easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
      });
    });
  }, [selected, active]);

  function recordRowPositions() {
    previousPositions.current = new Map(
      [...rowElements.current].map(([id, row]) => [id, row.getBoundingClientRect().top]),
    );

    for (const row of rowElements.current.values()) {
      for (const animation of row.getAnimations?.() ?? []) {
        animation.cancel();
      }
    }
  }

  function capturePositions() {
    rememberScroll(selected[active]?.id);
    animateList.current = true;
    recordRowPositions();
  }

  function rememberScroll(id: string | undefined) {
    const row = id && rowElements.current.get(id);

    if (row && id) {
      scrollAnchor.current = { id, top: row.getBoundingClientRect().top };
    }
  }

  function resetTransitions() {
    scrollAnchor.current = null;
    previousPositions.current.clear();
    animateList.current = false;
    alignRestoredToTop.current = false;
  }

  return {
    rowElements,
    controls,
    capturePositions,
    rememberScroll,
    recordRowPositions,
    alignRestoredToTop,
    resetTransitions,
  };
}
