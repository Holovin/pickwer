import { expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { required, getElement, load, names, current } from './helpers';
import App from '@/app/App';

test('hidden rows return in place with stable numbers and can be unhidden', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  const confirm = vi.spyOn(window, 'confirm');
  fireEvent.click(screen.getByRole('button', { name: 'Hide b' }));
  expect(names()).toEqual(['a', 'c']);
  expect([...document.querySelectorAll('.badge-number')].map((e) => e.textContent)).toEqual(['1', '3']);
  expect(confirm).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Include hidden files' }));
  expect(names()).toEqual(['a', 'b', 'c']);
  expect(document.querySelector('.hidden-file .file-name')?.textContent).toBe('b');

  fireEvent.click(screen.getByRole('button', { name: 'Unhide b' }));
  fireEvent.click(screen.getByRole('button', { name: 'Visible files only' }));
  expect(names()).toEqual(['a', 'b', 'c']);
});

test('hiding every row leaves an empty view and visibility switch restores all', async () => {
  render(<App />, { reactStrictMode: true });
  await load(['a']);
  fireEvent.click(screen.getByRole('button', { name: 'Hide a' }));
  expect(screen.queryByRole('img')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Include hidden files' }));
  expect(current()).toBe('a');
});

test('Backspace toggles the current file without repeating or affecting form controls', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  fireEvent.keyDown(window, { key: 'ArrowDown' });
  fireEvent.keyDown(window, { key: 'Backspace' });
  expect(document.querySelector('.pending-hide')).not.toBeNull();

  fireEvent.keyDown(window, { key: 'Backspace' });
  expect(names()).toEqual(['a', 'c']);

  fireEvent.keyDown(window, { key: 'Backspace', repeat: true });
  expect(names()).toEqual(['a', 'c']);

  fireEvent.click(screen.getByRole('button', { name: 'Include hidden files' }));
  fireEvent.click(getElement('.hidden-file .select-item'));
  fireEvent.keyDown(window, { key: 'Backspace' });
  expect(document.querySelector('.pending-hide')).not.toBeNull();

  fireEvent.keyDown(window, { key: 'Backspace' });
  expect(document.querySelector('.hidden-file')).toBeNull();

  fireEvent.keyDown(window, { key: 'Backspace' });
  expect(document.querySelector('.pending-hide')).not.toBeNull();

  fireEvent.keyDown(window, { key: 'Backspace' });
  expect(document.querySelector('.hidden-file .file-name')?.textContent).toBe('b');

  fireEvent.keyDown(screen.getByLabelText('Screenshot folder'), { key: 'Backspace' });
  expect(document.querySelector('.hidden-file .file-name')?.textContent).toBe('b');
});

test('Ctrl/Cmd Z undo the last three visibility changes and ignore held keys', async () => {
  render(<App />, { reactStrictMode: true });
  await load(['a', 'b', 'c', 'd']);
  for (const name of ['a', 'b', 'c', 'd']) {
    fireEvent.click(screen.getByRole('button', { name: `Hide ${name}` }));
  }
  expect(names()).toEqual([]);

  fireEvent.keyDown(window, { key: 'z', code: 'KeyY', ctrlKey: true });
  expect(names()).toEqual(['d']);
  expect(current()).toBe('d');

  fireEvent.keyDown(window, { key: 'z', ctrlKey: true, repeat: true });
  expect(names()).toEqual(['d']);

  fireEvent.keyDown(window, { key: 'z', metaKey: true });
  expect(names()).toEqual(['c', 'd']);
  expect(current()).toBe('d');

  fireEvent.keyDown(window, { key: 'я', code: 'KeyZ', metaKey: true });
  expect(names()).toEqual(['b', 'c', 'd']);

  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  expect(names()).toEqual(['b', 'c', 'd']);

  fireEvent.click(screen.getByRole('button', { name: 'Include hidden files' }));
  fireEvent.click(screen.getByRole('button', { name: 'Unhide a' }));
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  expect(document.querySelector('.hidden-file .file-name')?.textContent).toBe('a');
});

test('Backspace confirmation cancels on another key, click or timeout', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  fireEvent.keyDown(window, { key: 'Backspace' });
  expect(names()).toEqual(['a', 'b', 'c']);

  fireEvent.keyDown(window, { key: 'Backspace', repeat: true });
  expect(names()).toEqual(['a', 'b', 'c']);

  fireEvent.keyDown(window, { key: 'ArrowDown' });
  expect(document.querySelector('.pending-hide')).toBeNull();
  expect(current()).toBe('b');

  fireEvent.keyDown(window, { key: 'Backspace' });
  fireEvent.click(screen.getAllByRole('button', { name: 'Fit' })[0]);
  expect(document.querySelector('.pending-hide')).toBeNull();

  vi.useFakeTimers();
  try {
    fireEvent.keyDown(window, { key: 'Backspace' });
    act(() => vi.advanceTimersByTime(10000));
    expect(document.querySelector('.pending-hide')).toBeNull();

    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(names()).toEqual(['a', 'b', 'c']);
    expect(document.querySelector('.pending-hide')).not.toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test('minus shows visible files and equals includes hidden files without affecting note input', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  fireEvent.click(screen.getByRole('button', { name: 'Hide a' }));
  fireEvent.keyDown(window, { key: '=', code: 'Equal' });
  expect(names()).toEqual(['a', 'b', 'c']);

  fireEvent.keyDown(window, { key: '-', code: 'Minus' });
  expect(names()).toEqual(['b', 'c']);

  fireEvent.keyDown(window, { key: '=', code: 'Equal' });
  expect(names()).toEqual(['a', 'b', 'c']);

  fireEvent.keyDown(screen.getByRole('textbox', { name: 'File note' }), { key: '-' });
  expect(names()).toEqual(['a', 'b', 'c']);

  fireEvent.keyDown(window, { key: '-', code: 'NumpadSubtract' });
  expect(names()).toEqual(['b', 'c']);
});

test('undo preserves the current selection and its position when restoring a row above it', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  fireEvent.keyDown(window, { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('button', { name: 'Hide b' }));
  const scroller = getElement('.controls');
  scroller.scrollTop = 20;
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 250 } as DOMRect);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.tagName === 'LI') {
      const index = Array.from(required(this.parentElement).children).indexOf(this);
      return {
        top: index * 60 - scroller.scrollTop,
        bottom: index * 60 + 50 - scroller.scrollTop,
      } as DOMRect;
    }
    return { top: 0, bottom: 250 } as DOMRect;
  });
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  expect(current()).toBe('c');
  // Keep c anchored as b is restored above it, rather than forcing b to the top.
  expect(scroller.scrollTop).toBe(80);
  expect(getElement('.active').getBoundingClientRect().top).toBe(40);
});

test('stash requires two bracket presses, supports three filters and undo', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  fireEvent.keyDown(window, { key: '[', code: 'BracketLeft' });
  expect(names()).toEqual(['a', 'b', 'c']);

  fireEvent.keyDown(window, { key: '[', code: 'BracketLeft', repeat: true });
  expect(names()).toEqual(['a', 'b', 'c']);

  fireEvent.keyDown(window, { key: '[', code: 'BracketLeft' });
  expect(names()).toEqual(['b', 'c']);

  fireEvent.click(screen.getByRole('button', { name: 'Hide c' }));
  fireEvent.click(screen.getByRole('button', { name: 'Include stash' }));
  expect(names()).toEqual(['a', 'b']);
  expect(document.querySelector('.stashed-file .file-name')?.textContent).toBe('a');
  expect(document.querySelector('.stashed-file')?.classList.contains('hidden-file')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Include hidden files' }));
  expect(names()).toEqual(['a', 'b', 'c']);

  fireEvent.click(getElement('.stashed-file .select-item'));
  fireEvent.keyDown(window, { key: ']', code: 'BracketRight' });
  fireEvent.keyDown(window, { key: ']', code: 'BracketRight' });
  expect(document.querySelector('.stashed-file')).toBeNull();

  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  expect(document.querySelector('.stashed-file .file-name')?.textContent).toBe('a');

  fireEvent.click(screen.getByRole('button', { name: 'Visible files only' }));
  expect(names()).toEqual(['b']);
});

test('stash survives reopening and Backspace does not confirm a pending stash', async () => {
  const app = render(<App />, { reactStrictMode: true });
  await load();
  vi.useFakeTimers();
  fireEvent.keyDown(window, { key: '[', code: 'BracketLeft' });
  expect(document.querySelector('.pending-stash')).not.toBeNull();

  act(() => vi.advanceTimersByTime(9000));
  fireEvent.keyDown(window, { key: 'Backspace' });
  expect(names()).toEqual(['a', 'b', 'c']);
  expect(document.querySelector('.pending-stash')).toBeNull();
  expect(document.querySelector('.pending-hide')).not.toBeNull();

  act(() => vi.advanceTimersByTime(1500));
  expect(document.querySelector('.pending-hide')).not.toBeNull();

  fireEvent.keyDown(window, { key: '[', code: 'BracketLeft' });
  expect(document.querySelector('.pending-stash')).not.toBeNull();

  act(() => vi.advanceTimersByTime(10000));
  expect(document.querySelector('.pending-stash')).toBeNull();

  vi.useRealTimers();
  fireEvent.keyDown(window, { key: 'ArrowDown' });
  fireEvent.keyDown(window, { key: ']', code: 'BracketRight' });
  fireEvent.keyDown(window, { key: ']', code: 'BracketRight' });
  fireEvent.click(screen.getByRole('button', { name: 'Include stash' }));
  app.unmount();
  render(<App />, { reactStrictMode: true });
  await load();
  expect(document.querySelector('.stashed-file .file-name')?.textContent).toBe('b');
  expect(screen.getByRole('button', { name: 'Include stash' }).getAttribute('aria-pressed')).toBe('true');
});

test('Ctrl+Y on QWERTZ does not undo a visibility change', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  fireEvent.click(screen.getByRole('button', { name: 'Hide a' }));
  fireEvent.keyDown(window, { key: 'y', code: 'KeyZ', ctrlKey: true });
  expect(names()).toEqual(['b', 'c']);
  fireEvent.keyDown(window, { key: 'z', code: 'KeyY', ctrlKey: true });
  expect(names()).toEqual(['a', 'b', 'c']);
});
