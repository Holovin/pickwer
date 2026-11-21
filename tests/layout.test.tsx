import { expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { required, getElement, load, names, current } from './helpers';
import App from '@/app/App';

test('visibility switches preserve the selected row position in the scroll viewport', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  fireEvent.keyDown(window, { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('button', { name: 'Hide a' }));
  const controls = getElement('.controls');
  vi.spyOn(controls, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 200 } as DOMRect);
  const row = required(screen.getByRole('button', { name: 'Hide b' }).closest('li'));
  vi.spyOn(row, 'getBoundingClientRect').mockImplementation(() => {
    const index = Array.from(required(row.parentElement).children).indexOf(row);
    return {
      top: index * 50 - controls.scrollTop,
      bottom: index * 50 - controls.scrollTop + 40,
      height: 40,
    } as DOMRect;
  });
  fireEvent.click(screen.getByRole('button', { name: 'Include hidden files' }));
  expect(controls.scrollTop).toBe(50);
  expect(current()).toBe('b');

  fireEvent.click(screen.getByRole('button', { name: 'Visible files only' }));
  expect(controls.scrollTop).toBe(0);
  expect(current()).toBe('b');
});

test('two panels share previews but keep independent zoom settings after reopening', async () => {
  const app = render(<App />, { reactStrictMode: true });
  await load();
  const previews = () => screen.getAllByRole('img').map((image) => image.getAttribute('alt'));
  expect(previews()).toEqual(['a', 'a']);

  fireEvent.change(screen.getByRole('combobox', { name: 'Custom zoom: Left viewer' }), {
    target: { value: '0.5' },
  });
  expect(screen.getAllByRole('button', { name: 'Fit' })[1].getAttribute('aria-pressed')).toBe('true');

  fireEvent.change(screen.getByRole('combobox', { name: 'Custom zoom: Right viewer' }), {
    target: { value: '0.7' },
  });
  const stacks = document.querySelectorAll<HTMLElement>('.stack');
  expect(stacks[0].style.width).toBe('603px');
  expect(parseFloat(stacks[1].style.width)).toBeCloseTo(844.2);

  fireEvent.keyDown(window, { key: 'ArrowDown' });
  expect(previews()).toEqual(['b', 'b']);

  fireEvent.keyDown(window, { key: '1', code: 'Digit1' });
  expect(previews()).toEqual(['a', 'a']);

  fireEvent.keyUp(window, { key: '1', code: 'Digit1' });
  expect(previews()).toEqual(['b', 'b']);

  app.unmount();
  render(<App />, { reactStrictMode: true });
  await load();
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Custom zoom: Left viewer' }).value).toBe('0.5');
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Custom zoom: Right viewer' }).value).toBe('0.7');
  expect(previews()).toEqual(['b', 'b']);
});

test('focused divider handles resizing without triggering viewer shortcuts', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  fireEvent.keyDown(window, { key: 'ArrowDown' });
  expect(current()).toBe('b');

  const divider = screen.getByRole('separator', { name: 'Panel sizes' });
  divider.focus();
  fireEvent.keyDown(divider, { key: 'ArrowLeft' });
  expect(divider.getAttribute('aria-valuenow')).toBe('49');
  expect(fireEvent.keyDown(divider, { key: 'ArrowDown', shiftKey: true })).toBe(true);
  expect(fireEvent.keyDown(divider, { key: '1', code: 'Digit1' })).toBe(true);
  expect(current()).toBe('b');
  expect(names()).toEqual(['a', 'b', 'c']);
});

test('divider resizes both panels, clamps the ratio and resets on double click', () => {
  const save = vi.spyOn(Storage.prototype, 'setItem');
  vi.stubGlobal('PointerEvent', MouseEvent);
  render(<App />, { reactStrictMode: true });
  const divider = screen.getByRole('separator', { name: 'Panel sizes' });
  const panels = getElement('.viewer-panels');
  vi.spyOn(panels, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 1000 } as DOMRect);
  Object.defineProperty(divider, 'setPointerCapture', { value: vi.fn() });
  Object.defineProperty(divider, 'releasePointerCapture', { value: vi.fn() });
  fireEvent.pointerDown(divider, { button: 0 });
  fireEvent.pointerMove(divider, { clientX: 800 });
  expect(divider.getAttribute('aria-valuenow')).toBe('70');

  fireEvent.pointerMove(divider, { clientX: 1200 });
  expect(divider.getAttribute('aria-valuenow')).toBe('80');

  expect(save).not.toHaveBeenCalled();
  fireEvent.pointerUp(divider);
  expect(save).toHaveBeenCalledTimes(1);
  fireEvent.pointerMove(divider, { clientX: 300 });
  expect(divider.getAttribute('aria-valuenow')).toBe('80');

  fireEvent.doubleClick(divider);
  expect(divider.getAttribute('aria-valuenow')).toBe('50');
});

test('arrow navigation scrolls only enough to keep the active row visible', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  const scroller = getElement('.controls');
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 200 } as DOMRect);
  document.querySelectorAll('.selected li').forEach((row, index) => {
    vi.spyOn(row, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          top: 100 + index * 60 - scroller.scrollTop,
          bottom: 150 + index * 60 - scroller.scrollTop,
        }) as DOMRect,
    );
  });
  fireEvent.keyDown(window, { key: 'ArrowDown' });
  expect(scroller.scrollTop).toBe(10);

  fireEvent.keyDown(window, { key: 'ArrowDown' });
  expect(scroller.scrollTop).toBe(70);

  fireEvent.keyDown(window, { key: 'ArrowUp' });
  expect(scroller.scrollTop).toBe(60);

  fireEvent.keyDown(window, { key: 'ArrowDown' });
  expect(scroller.scrollTop).toBe(70);

  fireEvent.keyDown(window, { key: 'ArrowDown' });
  expect(scroller.scrollTop).toBe(0);
});

test('reopening aligns the restored active file with the top of the list', async () => {
  const first = render(<App />, { reactStrictMode: true });
  await load();
  fireEvent.keyDown(window, { key: 'ArrowUp' });
  first.unmount();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('controls')) {
      return { top: 0, bottom: 100 } as DOMRect;
    }
    if (this.tagName === 'LI') {
      const index = Array.from(required(this.parentElement).children).indexOf(this);
      const scroll = getElement('.controls').scrollTop;
      return { top: index * 60 - scroll, bottom: index * 60 + 50 - scroll } as DOMRect;
    }
    return { top: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  });
  render(<App />, { reactStrictMode: true });
  await load();
  expect(current()).toBe('c');
  expect(getElement('.controls').scrollTop).toBe(120);
});

test('panels mount only the reference and displayed screenshot, including at 200%', async () => {
  render(<App />, { reactStrictMode: true });
  await load(['a', 'b', 'c', 'd', 'e']);
  expect(document.querySelectorAll('.stack img')).toHaveLength(2);

  fireEvent.keyDown(window, { key: 'ArrowDown' });
  expect(document.querySelectorAll('.stack img')).toHaveLength(4);

  const zoom = screen.getByRole<HTMLSelectElement>('combobox', {
    name: 'Custom zoom: Left viewer',
  });
  expect([...zoom.options].map((option) => option.text)).not.toContain('0%');

  fireEvent.change(zoom, { target: { value: '2' } });
  expect(document.querySelector<HTMLElement>('#left-viewer .stack')?.style.width).toBe('2412px');
});

test('Fit shows the measured zoom rounded to a whole percent', async () => {
  let resize = () => {};
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  let width = 603;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { width: this.classList.contains('stack') ? width : 0 } as DOMRect;
  });
  render(<App />, { reactStrictMode: true });
  await load();
  expect(screen.getAllByRole('button', { name: 'Fit (50%)' })).toHaveLength(2);

  width = 400.4;
  act(() => resize());
  expect(screen.getAllByRole('button', { name: /^Fit \(/ }).map((button) => button.textContent)).toContain('Fit (33%)');

  fireEvent.change(screen.getByRole('combobox', { name: 'Custom zoom: Left viewer' }), { target: { value: '0.5' } });
  expect(screen.getAllByRole('button', { name: /^Fit/ })[0].textContent).toBe('Fit');
});

test('the help button describes the keyboard shortcuts', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  const help = screen.getByRole('button', { name: 'Keyboard shortcuts' });

  const tooltip = required(document.getElementById(required(help.getAttribute('aria-describedby'))));

  expect(tooltip.getAttribute('role')).toBe('tooltip');
  expect(tooltip.textContent).toContain('browse');
  expect(tooltip.querySelectorAll('.key-hint-group')).toHaveLength(3);
});
