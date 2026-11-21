export interface SavedFile {
  id: string;
  number: number;
  hidden: boolean;
  stashed: boolean;
  note: string;
}

export interface SavedState {
  version: 1;
  pathFormat: 'relative-v1';
  updatedAt: number;
  files: SavedFile[];
  activeId?: string;
  showHidden: boolean;
  showStash: boolean;
}

export interface ViewerSettings {
  zoom: string;
  rightZoom: string;
  split: number;
}

export interface SettingsBackup {
  format: 'screenshot-compare';
  version: 1;
  folder: string;
  state: SavedState;
}
