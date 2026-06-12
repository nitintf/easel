// Type augmentations for optional/browser-specific APIs used by editor-core

interface FontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  blob(): Promise<Blob>;
}

interface Window {
  queryLocalFonts?: () => Promise<FontData[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<FileSystemFileHandle>;
}

// Optional deps — dynamically imported at runtime, not bundled
declare module "esbuild" {
  export function transform(
    input: string,
    options?: Record<string, unknown>,
  ): Promise<{ code: string }>;
  export function transformSync(input: string, options?: Record<string, unknown>): { code: string };
}

declare module "valibot" {
  const valibot: any;
  export = valibot;
}
