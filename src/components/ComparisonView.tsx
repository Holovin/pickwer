import { CircleQuestionMark } from 'lucide-react';
import { useCallback, useEffect, useEffectEvent, useRef, useState, type ComponentProps, type RefObject } from 'react';
import { PanelDivider } from '@/components/PanelDivider';
import { ViewerPanel } from '@/components/ViewerPanel';
import { readViewerSettings, saveViewerSettings } from '@/storage/local';

// Groups: moving through the list, changing it, then the note and filter.
const keyHints = [
  [
    ['↑ ↓', 'browse'],
    ['← → / 1–9', 'compare'],
    ['Shift/⌘ ↑ ↓', 'reorder'],
  ],
  [
    ['⌫ twice', 'hide / unhide'],
    ['[ ] twice', 'stash'],
    ['⌘/Ctrl+Z', 'undo'],
  ],
  [
    ['Tab / Enter', 'note'],
    ['− / =', 'visibility'],
  ],
];

interface ComparisonViewProps extends Pick<ComponentProps<typeof ViewerPanel>, 'base' | 'current' | 'details'> {
  stage: RefObject<HTMLElement | null>;
  onError: (message: string) => void;
}

export function ComparisonView({ stage, onError, details, ...panelProps }: ComparisonViewProps) {
  const [initialViewer] = useState(readViewerSettings);
  const [split, setSplit] = useState(initialViewer.split);
  const panels = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);
  const [zoom, setZoom] = useState(initialViewer.zoom);
  const [rightZoom, setRightZoom] = useState(initialViewer.rightZoom);

  const lastSaved = useRef(initialViewer);

  const persist = useCallback(
    (settings: typeof initialViewer) => {
      const previous = lastSaved.current;

      if (
        previous.zoom === settings.zoom &&
        previous.rightZoom === settings.rightZoom &&
        previous.split === settings.split
      ) {
        return;
      }

      if (saveViewerSettings(settings)) {
        lastSaved.current = settings;
      } else {
        onError('The browser could not save your viewer settings.');
      }
    },
    [onError],
  );

  const saveChanges = useEffectEvent(() => persist({ zoom, rightZoom, split }));
  useEffect(() => {
    if (!resizing) {
      persist({ zoom, rightZoom, split });
    }
  }, [zoom, rightZoom, split, resizing, persist]);

  useEffect(() => {
    const flush = () => saveChanges();
    window.addEventListener('pagehide', flush);

    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  return (
    <main className="viewer" ref={stage} tabIndex={-1} aria-label="Comparison viewer">
      <div
        className={`viewer-panels ${resizing ? 'resizing' : ''}`}
        ref={panels}
        style={{ gridTemplateColumns: `minmax(0, ${split}fr) minmax(0, ${100 - split}fr)` }}
      >
        <PanelDivider
          controlledPanelId="left-viewer"
          split={split}
          container={panels}
          onChange={setSplit}
          onResizingChange={setResizing}
        />
        <ViewerPanel
          id="left-viewer"
          label="Left viewer"
          details={details}
          panelZoom={zoom}
          setPanelZoom={setZoom}
          {...panelProps}
        />
        <ViewerPanel
          id="right-viewer"
          label="Right viewer"
          panelZoom={rightZoom}
          setPanelZoom={setRightZoom}
          {...panelProps}
        />
      </div>
      <div className="bottom-bar">
        <div className="key-help">
          <button type="button" className="key-help-button" aria-label="Keyboard shortcuts" aria-describedby="key-help">
            <CircleQuestionMark size={18} />
          </button>
          <div id="key-help" role="tooltip" className="key-help-tooltip">
            <dl className="key-hints">
              {keyHints.map((group) => (
                <div key={group[0][1]} className="key-hint-group">
                  {group.map(([keys, action]) => (
                    <div key={action} className="key-hint">
                      <dt>{keys}</dt>
                      <dd>{action}</dd>
                    </div>
                  ))}
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </main>
  );
}
