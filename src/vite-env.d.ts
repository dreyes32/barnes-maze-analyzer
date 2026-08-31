/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __GIT_SHA__: string;

declare module "*?worker" {
  const WorkerFactory: {
    new (): Worker;
  };
  export default WorkerFactory;
}

interface Window {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
}

interface FileSystemDirectoryHandle {
  values(): AsyncIterable<FileSystemHandle>;
}
