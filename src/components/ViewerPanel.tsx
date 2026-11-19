import { Images } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { LoadedScreenshot } from '@/model/screenshot';
import { zoomPercentages } from '@/model/viewer';

const DETAILS_MIN_WIDTH = 510;
const PANEL_MIN_WIDTH = 370;
const CANVAS_PADDING = 20;

interface ViewerPanelProps {
  id: string;
  label: string;
  details?: ReactNode;
  panelZoom: string;
  setPanelZoom: (value: string) => void;
  current?: LoadedScreenshot;
  base?: LoadedScreenshot;
}

export function ViewerPanel({ id, label, details, panelZoom, setPanelZoom, current, base }: ViewerPanelProps) {
  const stack = useRef<HTMLDivElement>(null);
  const [fitPercent, setFitPercent] = useState<number | null>(null);
  const baseWidth = base?.width;
  const fit = panelZoom === 'fit';

  // Fit scales with the panel, so measure the drawn width to show the real zoom.
  useLayoutEffect(() => {
    const element = stack.current;

    if (!fit || !baseWidth || !element || typeof ResizeObserver === 'undefined') {
      return;
    }

    const measure = () => setFitPercent(Math.round((element.getBoundingClientRect().width / baseWidth) * 100));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [fit, baseWidth]);

  return (
    <section id={id} className="viewer-panel" aria-label={label}>
      <div
        className="panel-content"
        style={{
          minWidth: Math.max(
            details ? DETAILS_MIN_WIDTH : PANEL_MIN_WIDTH,
            base && panelZoom !== 'fit' ? base.width * Number(panelZoom) + CANVAS_PADDING * 2 : 0,
          ),
        }}
      >
        <div className="toolbar">
          {details}
          <div className="panel-zoom">
            <button type="button" aria-pressed={fit} onClick={() => setPanelZoom('fit')}>
              {fit && base && fitPercent !== null ? `Fit (${fitPercent}%)` : 'Fit'}
            </button>
            <select
              aria-label={`Custom zoom: ${label}`}
              value={panelZoom === 'fit' ? '' : panelZoom}
              onChange={(e) => setPanelZoom(e.target.value)}
            >
              <option value="" disabled>
                %
              </option>
              {zoomPercentages.map((percent) => (
                <option key={percent} value={String(percent / 100)}>
                  {percent}%
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={`canvas ${panelZoom === 'fit' ? 'fit' : 'scaled'}`}>
          {base ? (
            <div
              ref={stack}
              className="stack"
              style={
                panelZoom === 'fit'
                  ? {
                      aspectRatio: `${base.width}/${base.height}`,
                      width: `min(100cqw, calc(100cqh * ${base.width} / ${base.height}))`,
                    }
                  : {
                      width: base.width * Number(panelZoom),
                      height: base.height * Number(panelZoom),
                    }
              }
            >
              {/* One element keeps showing the previous frame while the next source decodes;
                  a remounted image would paint empty for a moment and flicker. */}
              {current && (
                <img
                  src={current.url}
                  width={current.width}
                  height={current.height}
                  alt={current.name}
                  decoding="sync"
                  draggable="false"
                />
              )}
              {/* Keep the reference decoded for instant keyboard comparison. */}
              {base.id !== current?.id && (
                <img
                  key={base.id}
                  src={base.url}
                  alt=""
                  aria-hidden="true"
                  draggable="false"
                  style={{ visibility: 'hidden' }}
                />
              )}
            </div>
          ) : (
            <div className="empty-view">
              <Images className="frame-icon" size={48} strokeWidth={1.25} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
