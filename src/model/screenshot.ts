export const pngExtension = /\.png$/i;

export interface FolderEntry {
  file: File;
  id: string;
}

export interface Screenshot {
  id: string;
  name: string;
  url: string;
}

export interface LoadedScreenshot extends Screenshot {
  width: number;
  height: number;
  number: number;
}
