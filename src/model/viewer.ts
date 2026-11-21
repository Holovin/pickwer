export const panelSplit = { min: 20, max: 80, initial: 50 } as const;

export function clampPanelSplit(percent: number): number {
  return Math.max(panelSplit.min, Math.min(panelSplit.max, percent));
}

export const zoomPercentages = Array.from({ length: 20 }, (_, index) => (index + 1) * 10);

const zoomValues = new Set(['fit', ...zoomPercentages.map((percent) => String(percent / 100))]);

export const validZoom = (value: unknown): value is string => typeof value === 'string' && zoomValues.has(value);
