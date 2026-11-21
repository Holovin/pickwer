import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { load, names, current } from './helpers';
import App from '@/app/App';

test('folder fills list in natural order', async () => {
  render(<App />, { reactStrictMode: true });
  expect(screen.queryByRole('list')).toBeNull();

  await load(['v10', 'v2', 'v1']);
  expect(names()).toEqual(['v1', 'v2', 'v10']);
  expect(current()).toBe('v1');
});

test('vertical navigation and temporary horizontal reference keep active selection', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  fireEvent.keyDown(window, { key: 'ArrowDown' });
  expect(current()).toBe('b');

  fireEvent.keyDown(window, { key: 'ArrowLeft' });
  expect(current()).toBe('a');
  expect(document.querySelector('.active .file-name')?.textContent).toBe('b');

  fireEvent.keyDown(window, { key: 'ArrowRight' });
  fireEvent.keyUp(window, { key: 'ArrowLeft' });
  expect(current()).toBe('a');

  fireEvent.keyUp(window, { key: 'ArrowRight' });
  expect(current()).toBe('b');

  fireEvent.keyDown(window, { key: 'ArrowLeft' });
  fireEvent.blur(window);
  expect(current()).toBe('b');
});

test('drop into empty space moves first to end and buttons preserve selected image', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  const list = screen.getByRole('list', { name: 'Comparison list' }),
    rows = list.querySelectorAll('li');
  rows.forEach((row, i) => {
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top: i * 50, height: 40 } as DOMRect);
  });
  const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
  fireEvent.keyDown(window, { key: '2', code: 'Digit2' });
  expect(current()).toBe('b');
  fireEvent.dragStart(rows[0], { dataTransfer });
  fireEvent.dragOver(list, { dataTransfer, clientY: 350 });
  fireEvent.drop(list, { dataTransfer, clientY: 350 });
  expect(names()).toEqual(['b', 'c', 'a']);
  expect(current()).toBe('a');

  fireEvent.keyDown(window, { key: 'ArrowUp', shiftKey: true });
  expect(names()).toEqual(['b', 'a', 'c']);

  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(current()).toBe('b');

  fireEvent.keyUp(window, { key: 'ArrowRight' });
  expect(current()).toBe('a');
});

test('hovering a number previews any row without changing selection', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  fireEvent.keyDown(window, { key: 'ArrowDown' });
  expect(current()).toBe('b');

  fireEvent.change(screen.getByRole('textbox', { name: 'File note' }), {
    target: { value: 'Unblurred draft' },
  });
  const badges = document.querySelectorAll('.preview-badge');
  fireEvent.mouseEnter(badges[2]);
  expect(current()).toBe('c');
  expect(document.querySelector('.active .file-name')?.textContent).toBe('b');
  expect(document.querySelector('.reference-preview .file-name')?.textContent).toBe('c');

  fireEvent.click(badges[2]);
  fireEvent.mouseLeave(badges[2]);
  expect(current()).toBe('b');
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'File note' }).value).toBe('Unblurred draft');
  expect(document.querySelector('.active .file-note')?.textContent).toBe('Unblurred draft');

  fireEvent.mouseEnter(badges[1]);
  expect(document.querySelector('.active.reference-preview .file-name')?.textContent).toBe('b');

  fireEvent.mouseLeave(badges[1]);
  expect(document.querySelector('.reference-preview')).toBeNull();
});

test('number keys preview list positions while held and restore the previous held preview', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  fireEvent.keyDown(window, { key: 'ArrowDown' });
  expect(current()).toBe('b');

  fireEvent.keyDown(window, { key: '3', code: 'Digit3' });
  expect(current()).toBe('c');

  fireEvent.keyDown(window, { key: '1', code: 'Digit1' });
  expect(current()).toBe('a');

  fireEvent.keyDown(window, { key: '3', code: 'Digit3', repeat: true });
  expect(current()).toBe('a');

  fireEvent.keyUp(window, { key: '1', code: 'Digit1' });
  expect(current()).toBe('c');

  fireEvent.keyUp(window, { key: '3', code: 'Digit3' });
  expect(current()).toBe('b');

  fireEvent.keyDown(window, { key: '9', code: 'Digit9' });
  expect(current()).toBe('b');

  fireEvent.keyDown(window, { key: '1', code: 'Numpad1' });
  expect(current()).toBe('a');

  fireEvent.blur(window);
  expect(current()).toBe('b');
});

test('Shift and Command arrows reorder the active file without wrapping and zoom buttons preserve shortcuts', async () => {
  render(<App />, { reactStrictMode: true });
  await load();

  fireEvent.keyDown(window, { key: 'ArrowUp', shiftKey: true });
  expect(names()).toEqual(['a', 'b', 'c']);

  fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true });
  expect(names()).toEqual(['b', 'a', 'c']);
  expect(current()).toBe('a');

  fireEvent.keyDown(window, { key: 'ArrowDown', metaKey: true });
  expect(names()).toEqual(['b', 'c', 'a']);

  fireEvent.keyDown(window, { key: 'ArrowDown', metaKey: true });
  expect(names()).toEqual(['b', 'c', 'a']);

  fireEvent.keyDown(window, { key: 'ArrowUp', metaKey: true });
  expect(names()).toEqual(['b', 'a', 'c']);

  fireEvent.change(screen.getByRole('combobox', { name: 'Custom zoom: Left viewer' }), {
    target: { value: '1' },
  });
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Custom zoom: Left viewer' }).value).toBe('1');

  fireEvent.keyDown(window, { key: '2', code: 'Digit2' });
  expect(current()).toBe('a');

  fireEvent.keyUp(window, { key: '2', code: 'Digit2' });
});

test('shifted digits and horizontal arrows do not activate temporary previews', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  fireEvent.keyDown(window, { key: 'ArrowDown' });
  expect(current()).toBe('b');
  for (const [key, code] of [
    ['!', 'Digit1'],
    ['1', 'Digit1'],
    ['ArrowLeft', 'ArrowLeft'],
    ['ArrowRight', 'ArrowRight'],
  ]) {
    fireEvent.keyDown(window, { key, code, shiftKey: true });
    expect(current()).toBe('b');
    expect(document.querySelector('.reference-preview')).toBeNull();
    fireEvent.keyUp(window, { key, code });
  }
});
