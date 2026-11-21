import { Eye, EyeOff, GripVertical } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import type { PendingConfirmation } from '@/hooks/useConfirmation';
import type { ScreenshotListModel } from '@/hooks/useScreenshotList';

const SCROLL_EDGE_PX = 45;

const SCROLL_STEP_PX = 15;

interface ScreenshotListProps {
  list: ScreenshotListModel;
  pending: PendingConfirmation | null;
  previewIndex: number | null;
  notes: Record<string, string>;
  onHover: (id: string | null) => void;
}

export function ScreenshotList({ list, pending, previewIndex, notes, onHover }: ScreenshotListProps) {
  const { selected, active, setActive, moveItem, rowElements, marks, toggleHidden, controls } = list;
  const dragged = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  function insertionIndex(event: DragEvent<HTMLOListElement>) {
    const index = selected.findIndex(({ id }) => {
      const row = rowElements.current.get(id);
      if (!row) {
        return false;
      }
      const rect = row.getBoundingClientRect();

      return event.clientY < rect.top + rect.height / 2;
    });

    return index < 0 ? selected.length : index;
  }

  function drop(event: DragEvent<HTMLOListElement>) {
    if (!dragged.current) {
      return;
    }

    event.preventDefault();
    const from = selected.findIndex((f) => f.id === dragged.current);
    const insertion = insertionIndex(event);
    moveItem(from, insertion > from ? insertion - 1 : insertion);
    dragged.current = null;
    setDropTarget(null);
  }

  if (!selected.length) {
    return null;
  }

  return (
    <ol
      className={`selected ${dropTarget === selected.length ? 'drop-end' : ''}`}
      // biome-ignore lint/a11y/noRedundantRoles: Keep list semantics in Safari when list markers are hidden.
      role="list"
      aria-label="Comparison list"
      onDragOver={(e) => {
        if (!dragged.current) {
          return;
        }

        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTarget(insertionIndex(e));
        const scroller = controls.current;

        if (scroller) {
          const rect = scroller.getBoundingClientRect();

          if (e.clientY > rect.bottom - SCROLL_EDGE_PX) {
            scroller.scrollTop += SCROLL_STEP_PX;
          } else if (e.clientY < rect.top + SCROLL_EDGE_PX) {
            scroller.scrollTop -= SCROLL_STEP_PX;
          }
        }
      }}
      onDragLeave={(e) => {
        if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) {
          setDropTarget(null);
        }
      }}
      onDrop={drop}
    >
      {selected.map((file, i) => (
        <li
          key={file.id}
          // A ref cleanup keeps the row map in step with mounted rows.
          ref={(row) => {
            if (!row) {
              return;
            }

            rowElements.current.set(file.id, row);

            return () => {
              rowElements.current.delete(file.id);
            };
          }}
          draggable
          className={[
            pending?.id === file.id && (pending.action === 'stash' ? 'pending-stash' : 'pending-hide'),
            marks.get(file.id) === 'stashed' && 'stashed-file',
            marks.get(file.id) === 'hidden' && 'hidden-file',
            i === active && 'active',
            i === previewIndex && 'reference-preview',
            dropTarget === i && 'drop-before',
          ]
            .filter(Boolean)
            .join(' ')}
          onDragStart={(e) => {
            onHover(null);
            dragged.current = file.id;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', file.id);
          }}
          onDragEnd={() => {
            dragged.current = null;
            setDropTarget(null);
          }}
        >
          <span className="drag-handle">
            <GripVertical size={16} />
          </span>
          <button
            type="button"
            className="select-item"
            aria-pressed={i === active}
            onClick={(event) => {
              if (!(event.target instanceof Element && event.target.closest('[data-preview-id]'))) {
                setActive(i);
              }
            }}
          >
            {/* biome-ignore lint/a11y/noStaticElementInteractions: Hover gives a temporary preview; the viewer also supports keyboard preview shortcuts. */}
            <span
              className="badge preview-badge"
              data-preview-id={file.id}
              onMouseEnter={() => onHover(file.id)}
              onMouseLeave={() => onHover(null)}
            >
              <span className="badge-number">{file.number}</span>
              <Eye className="badge-eye" size={18} />
            </span>
            <span className="file-name">{file.name}</span>
            {notes[file.id] && (
              <span className="file-note" title={notes[file.id]}>
                {notes[file.id]}
              </span>
            )}
          </button>
          <button
            type="button"
            className="remove"
            aria-label={`${marks.get(file.id) === 'hidden' ? 'Unhide' : 'Hide'} ${file.name}`}
            title={marks.get(file.id) === 'hidden' ? 'Unhide' : 'Hide'}
            onClick={() => toggleHidden(i)}
          >
            {marks.get(file.id) === 'hidden' ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        </li>
      ))}
    </ol>
  );
}
