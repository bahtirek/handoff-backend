export type PhotoStorage = {
  getMetadata: (
    storageKey: string
  ) => Promise<{
    ContentLength?: number;
  }>;

  download: (
    storageKey: string
  ) => Promise<Buffer>;

  delete: (
    storageKey: string
  ) => Promise<void>;
};