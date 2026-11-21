# Pickwer

Local web tool for screenshot comparison

Live demo: [pickwer.halavin.de](https://pickwer.halavin.de) (it's fully static, so you can also host your own copy)

1. Open a folder with same-size PNGs
2. Pick screenshots in the sidebar
3. To compare, use:
   - ↑ ↓ — next / previous screenshot
   - Hold ← → or 1–9 — peek at the first or numbered screenshot
   - Shift/⌘ + ↑ ↓ — reorder (or drag)
4. You can also leave notes (shown in the header)
   - Tab / Enter — edit the note
5. The list has three display modes
   - normal (default)
   - hide: Backspace twice
   - stash: `[` or `]` twice
   - − / = — show normal only / show all
   - undo: Ctrl/⌘ + Z
6. Folder settings (notes, file order and hidden screenshots) are saved automatically in the browser (localStorage). They are also saved to the selected folder itself (Chromium-based browsers only; elsewhere, download them with **Export settings**)

## Development

See [AGENTS.md](AGENTS.md).
