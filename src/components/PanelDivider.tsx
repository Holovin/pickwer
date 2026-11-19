import { clampPanelSplit, panelSplit } from '@/model/viewer';
import { useRef, type RefObject } from 'react';

interface PanelDividerProps {
  split: number;
  controlledPanelId: string;
  container: RefObject<HTMLDivElement | null>;
  onChange: (split: number) => void;
  onResizingChange: (resizing: boolean) => void;
}

export function PanelDivider({ split, controlledPanelId, container, onChange, onResizingChange }: PanelDividerProps) {
  const pointer = useRef<number | null>(null);

  function finish() {
    pointer.current = null;
    onResizingChange(false);
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: This focusable splitter is an adjustable range widget with pointer and keyboard controls.
    <div
      className="panel-divider"
      role="separator"
      aria-label="Panel sizes"
      tabIndex={0}
      aria-controls={controlledPanelId}
      aria-orientation="vertical"
      aria-valuemin={panelSplit.min}
      aria-valuemax={panelSplit.max}
      aria-valuenow={Math.round(split)}
      aria-valuetext={`Left viewer ${Math.round(split)}%, right viewer ${100 - Math.round(split)}%`}
      style={{ left: `${split}%` }}
      title="Drag or use Left/Right to resize; Home/End for limits; Enter or double-click to reset to 50/50"
      onDoubleClick={() => onChange(panelSplit.initial)}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent.isComposing) {
          return;
        }

        let next: number;

        switch (event.key) {
          case 'ArrowLeft':
            next = split - 1;
            break;
          case 'ArrowRight':
            next = split + 1;
            break;
          case 'Home':
            next = panelSplit.min;
            break;
          case 'End':
            next = panelSplit.max;
            break;
          case 'Enter':
            next = panelSplit.initial;
            break;
          default:
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        onChange(clampPanelSplit(next));
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        onResizingChange(true);
      }}
      onPointerMove={(event) => {
        if (pointer.current !== event.pointerId) {
          return;
        }

        const bounds = container.current?.getBoundingClientRect();

        if (bounds && bounds.width > 0) {
          onChange(clampPanelSplit(((event.clientX - bounds.left) / bounds.width) * 100));
        }
      }}
      onPointerUp={(event) => {
        if (pointer.current !== event.pointerId) {
          return;
        }

        finish();
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
    />
  );
}
