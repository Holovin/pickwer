import { expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { required, getElement, load, mockDirectory, names, current } from './helpers';
import App from '@/app/App';

test('notes save on blur per folder while viewer settings remain global', async () => {
  const app = render(<App />, { reactStrictMode: true });
  await load(['a']);
  const note = screen.getByRole('textbox', { name: 'File note' });
  fireEvent.change(note, { target: { value: 'Softer shadow' } });
  expect(document.querySelector('.file-note')).toBeNull();

  fireEvent.blur(note);
  expect(document.querySelector('.file-note')?.textContent).toBe('Softer shadow');

  fireEvent.change(screen.getByRole('combobox', { name: 'Custom zoom: Left viewer' }), {
    target: { value: '0.5' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Custom zoom: Right viewer' }), {
    target: { value: '0.8' },
  });
  const divider = screen.getByRole('separator');
  vi.stubGlobal('PointerEvent', MouseEvent);
  Object.defineProperty(divider, 'setPointerCapture', { value: vi.fn() });
  vi.spyOn(getElement('.viewer-panels'), 'getBoundingClientRect').mockReturnValue({
    left: 0,
    width: 1000,
  } as DOMRect);
  fireEvent.pointerDown(divider, { button: 0 });
  fireEvent.pointerMove(divider, { clientX: 650 });
  app.unmount();
  render(<App />, { reactStrictMode: true });
  expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('65');

  await load(['a']);
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'File note' }).value).toBe('Softer shadow');

  await load(['a'], 'other/selected-files');
  await waitFor(() => expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'File note' }).value).toBe(''));
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Custom zoom: Left viewer' }).value).toBe('0.5');
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Custom zoom: Right viewer' }).value).toBe('0.8');
});

test('Tab and Enter toggle note focus, save on exit and keep selection', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  const note = screen.getByRole<HTMLInputElement>('textbox', { name: 'File note' });
  for (const key of ['Tab', 'Enter']) {
    fireEvent.keyDown(window, { key });
    expect(document.activeElement).toBe(note);

    fireEvent.change(note, { target: { value: `${key} note` } });
    fireEvent.keyDown(note, { key, repeat: true });
    expect(document.activeElement).toBe(note);

    fireEvent.keyDown(note, { key });
    expect(document.activeElement).toBe(document.querySelector('.sidebar'));
    expect(document.querySelector('.file-note')?.textContent).toBe(`${key} note`);
    expect(names()).toEqual(['a', 'b', 'c']);
  }
});

test('a fresh folder stays clean until an edit, and hiding the page flushes a live draft', async () => {
  vi.useFakeTimers();
  try {
    const files = ['a', 'b'];
    const { write } = mockDirectory(null, files);
    const first = render(<App />, { reactStrictMode: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
    });
    expect([...document.querySelectorAll('.badge-number')].map((row) => row.textContent)).toEqual(['1', '2']);

    first.unmount();
    files.shift();
    render(<App />, { reactStrictMode: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(write).not.toHaveBeenCalled();
    expect(document.querySelector('.badge-number')?.textContent).toBe('2');

    fireEvent.change(screen.getByRole('textbox', { name: 'File note' }), {
      target: { value: 'Live draft' },
    });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(async () => {
      fireEvent(document, new Event('visibilitychange'));
    });
    await act(async () => {
      fireEvent(window, new Event('pagehide'));
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(write.mock.calls[0][0]).state.files[1].note).toBe('Live draft');

    const disk = write.mock.calls[0][0];
    const reopened = mockDirectory(disk, ['b', 'z']);
    const choose = () => fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
    await act(async () => {
      choose();
    });
    expect([...document.querySelectorAll('.badge-number')].map((row) => row.textContent)).toEqual(['2', '3']);

    const added = mockDirectory(disk, ['b', 'c', 'z']);
    await act(async () => {
      choose();
    });
    expect(names()).toEqual(['b', 'z', 'c']);
    expect([...document.querySelectorAll('.badge-number')].map((row) => row.textContent)).toEqual(['2', '3', '4']);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(reopened.write).not.toHaveBeenCalled();
    expect(added.write).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

test('read-only export includes the live draft and restores it when the folder is reopened', async () => {
  const app = render(<App />, { reactStrictMode: true });
  const exportButton = () => screen.queryByRole('button', { name: 'Export settings' });
  expect(exportButton()).toBeNull();

  const screenshot = new File(['png'], 'a.png', { type: 'image/png' });
  Object.defineProperty(screenshot, 'webkitRelativePath', { value: 'shots/a.png' });
  const openFiles = async (files: File[]) => {
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Screenshot folder'), { target: { files } });
    });
  };
  await openFiles([screenshot]);
  fireEvent.change(screen.getByRole('combobox', { name: 'Custom zoom: Left viewer' }), {
    target: { value: '2' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'File note' }), {
    target: { value: 'Draft at export' },
  });
  let filename = '';
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    filename = this.download;
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Export settings' }));
  });
  expect(filename).toBe('screenshot-compare-settings.json');

  const blob = required(vi.mocked(URL.createObjectURL).mock.lastCall)[0] as Blob;
  expect(JSON.parse(await blob.text())).not.toHaveProperty('viewer');

  const backup = new File([blob], filename, { type: 'application/json' });
  Object.defineProperty(backup, 'webkitRelativePath', { value: `shots/${filename}` });
  app.unmount();
  render(<App />, { reactStrictMode: true });
  await openFiles([screenshot, backup]);
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Custom zoom: Left viewer' }).value).toBe('2');
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'File note' }).value).toBe('Draft at export');
  expect(screen.getByRole('status').textContent).toContain('Read-only folder');

  await load();
  expect(exportButton()).toBeNull();
});

test('switching folders flushes drafts made during the save and stays put if the final write fails', async () => {
  const first = mockDirectory(null, ['a'], 'first');
  const choose = () => fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
  render(<App />, { reactStrictMode: true });
  await act(async () => {
    choose();
  });
  const note = screen.getByRole('textbox', { name: 'File note' });
  fireEvent.change(note, { target: { value: 'First draft' } });

  let finishWrite!: () => void;
  first.write.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishWrite = resolve;
      }),
  );
  first.write.mockRejectedValueOnce(new Error('Write failed'));
  const second = mockDirectory(null, ['b'], 'second');
  await act(async () => {
    choose();
  });
  expect(JSON.parse(first.write.mock.calls[0][0]).state.files[0].note).toBe('First draft');

  fireEvent.change(note, { target: { value: 'Final draft' } });
  await act(async () => {
    finishWrite();
  });
  expect(current()).toBe('a');
  expect(screen.getByRole('alert').textContent).toContain('Could not save the current folder');
  expect(first.write).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Export settings' })).toBeTruthy();

  await act(async () => {
    choose();
  });
  expect(first.write).toHaveBeenCalledTimes(3);
  expect(JSON.parse(first.write.mock.calls[2][0]).state.files[0].note).toBe('Final draft');
  expect(current()).toBe('b');
  expect(second.write).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Export settings' })).toBeNull();
});

test('choosing again after a repeated write failure opens the next folder without saving', async () => {
  const first = mockDirectory(null, ['a'], 'first');
  const choose = () => fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
  render(<App />, { reactStrictMode: true });
  await act(async () => {
    choose();
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'File note' }), { target: { value: 'Unsaved' } });
  first.write.mockRejectedValue(new Error('Disk removed'));

  mockDirectory(null, ['b'], 'second');
  await act(async () => {
    choose();
  });
  expect(current()).toBe('a');
  expect(screen.getByRole('alert').textContent).toContain('choose a folder again');

  await act(async () => {
    choose();
  });
  expect(current()).toBe('b');
  expect(screen.getByRole('alert').textContent).toBe('');
});

test('Tab from the sidebar keeps native focus order', async () => {
  render(<App />, { reactStrictMode: true });
  await load();
  const sidebar = getElement('.sidebar');
  sidebar.focus();

  expect(fireEvent.keyDown(sidebar, { key: 'Tab' })).toBe(true);
  expect(document.activeElement).toBe(sidebar);
  expect(fireEvent.keyDown(sidebar, { key: 'Enter' })).toBe(false);
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'File note' }));
});
