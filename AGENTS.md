# Project guide

The viewer is a standalone React, TypeScript and Vite application.

## Development

Use Node.js 26 LTS. With nvm, run the following commands from this directory.

```sh
nvm install
npm ci
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/).

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

Run `npm run format` to format the source and tests with Biome. Use `@/` for imports from `src/`. Vite and Vitest read this alias from `tsconfig.json`.

The production build is written to `dist/`. Dependencies and build output are excluded from Git. Commit `package-lock.json` with dependency changes.

## Code readability

Separate logical blocks with one blank line. Keep related declarations and consecutive guards together. Leave a blank line between imports and module code, between exported declarations, and before a final return that follows preparation. Inside a function, separate setup, a loop or branch, and the work that follows when they are distinct steps. A short guard with its return stays compact.

Keep comments that explain a non-obvious constraint or an intentional lint exception. Give behavior-defining values a name near the code that uses them. In tests, separate scenarios and groups of actions and assertions.

## Docker

Run from this directory:

```sh
docker compose up -d --build
docker compose logs -f viewer
```

Open [http://localhost:8787/](http://localhost:8787/). Compose builds the `screenshot-compare:local` image and publishes container port 8080 on `127.0.0.1:8787` by default. To use another host port:

```sh
VIEWER_PORT=8788 docker compose up -d --build
```

Repeat `docker compose up -d --build` after updating the source to rebuild and replace the container. Keep any port or bind overrides consistent between runs. Stop and remove the container with:

```sh
docker compose down
```

The Docker files live in `docker/`; `compose.yaml` stays in the root and builds from the repository root. `docker/Dockerfile` uses Node.js 26 to run `npm ci` and `npm run build`, then copies only the built site into a [Static Web Server 2.44.0](https://static-web-server.net/v2/features/docker) image. Both base images are pinned by digest; update the tag and digest together when upgrading them. The runtime runs as UID/GID 65532 and serves `/public` on port 8080 with a read-only container filesystem. Node.js and the Vite development/preview servers are not needed at runtime.

`docker/sws.toml` enables compression and sets `Cache-Control: no-cache` on HTML (including `/`), and the Docker build appends a one-year immutable cache rule for each emitted Vite asset. The server restricts frame embedding to the same origin with `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`. The application has no history-based routes and does not need an SPA fallback; missing resources return 404.

No screenshot or settings volume is needed. The browser reads PNGs and writes `screenshot-compare-settings.json` in the folder selected on the user's computer. IndexedDB and localStorage also remain in that browser. Browser storage is scoped to the origin, so changing the scheme, hostname or port creates a separate local cache; use a stable address.

For access from another computer, put an HTTPS reverse proxy in front of the service. `http://localhost` is suitable for local use, but ordinary HTTP on a LAN address is not a secure context for the folder-access APIs. A proxy running on the Docker host can use the published loopback port. A proxy running in another container needs a shared Docker network and an upstream of `viewer:8080`; `localhost` inside that proxy container refers to the proxy itself. Configure the network and TLS for your deployment. `VIEWER_BIND` controls the published host interface and defaults to `127.0.0.1`.

## Repository scope

This repository contains only the viewer. Icon exports, screenshots, capture runs and the parent icon pipeline remain outside it. Select any screenshot directory through the UI.

## Source layout

- `src/app/`: application state and orchestration.
- `src/components/`: viewer, note editor and resizable divider.
- `src/hooks/`: reusable interaction state.
- `src/model/`: screenshot and saved-settings types.
- `src/storage/`: validation, local persistence, JSON backups and folder access.
- `src/styles/`: application styles.
- `tests/`: interaction and persistence tests, separate from application sources.

## Settings and folder identity

Folder settings cover notes, ordering, stable numbers, visibility and selection.

Where File System Access API is supported, selecting a folder requests read/write access. `screenshot-compare-settings.json` is loaded when the folder opens. Folder edits are backed up after ten seconds of inactivity, and at least every 30 seconds during continuous activity, when a local copy is available, or immediately when the local cache is unavailable. Hiding the page also flushes the current note and starts any pending write. Opening an unchanged folder leaves the file alone. A newer local copy or a recovered local copy without a JSON file is written back. If it is missing, verified local settings are used; an unreadable JSON file is not overwritten. The footer reports the storage status and only confirms the latest saved revision.

Folder handles are stored in IndexedDB and matched with `isSameEntry`, giving different physical folders separate local caches even when names and filenames match. Folder state uses paths relative to the selected directory and retains entries for absent PNGs.

Browsers without directory handles read the settings JSON from the selected folder’s root. Changes stay in the session until the user exports a copy with **Export settings**. The export includes the current note draft and uses a save picker when available or a browser download. If IndexedDB is unavailable, a writable directory still saves JSON, but its local cache is disabled and the UI reports the limitation. Global zoom/divider preferences continue to use localStorage.

Folder state includes an `updatedAt` revision. A fresh folder starts at zero and each edit advances the revision. When the folder opens, the newer of the local and on-disk copies wins. Zoom and divider position live in the browser’s global settings.
