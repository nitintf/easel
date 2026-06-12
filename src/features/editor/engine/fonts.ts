export {
  initFontService,
  getFontProvider,
  ensureNodeFont,
  loadFont as loadFontCore,
  listFamilies as listFamiliesCore,
  styleToWeight,
} from "@easel/editor-core";

interface TauriFontFamily {
  family: string;
  styles: string[];
}

let tauriFontsCache: TauriFontFamily[] | null = null;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let tauriFontsPromise: Promise<TauriFontFamily[]> | null = null;

async function getTauriFonts(): Promise<TauriFontFamily[]> {
  if (tauriFontsCache) return tauriFontsCache;
  tauriFontsPromise ??= import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<TauriFontFamily[]>("list_system_fonts"))
      .then((fonts) => {
        tauriFontsCache = fonts;
        return fonts;
      })
      .catch(() => []);
  return tauriFontsPromise;
}

export function preloadFonts(): void {
  if (isTauri()) {
    getTauriFonts()
      .then(registerFontFaces)
      .catch((error) => {
        console.error("Error preloading fonts:", error);
      });
  }
}

function registerFontFaces(fonts: TauriFontFamily[]): void {
  if (typeof document === "undefined") return;
  for (const { family } of fonts) {
    const face = new FontFace(family, `local("${family}")`);
    document.fonts.add(face);
  }
}

export async function listFamilies(): Promise<string[]> {
  if (isTauri()) {
    const fonts = await getTauriFonts();
    return fonts.map((f) => f.family);
  }
  const { listFamilies: coreList } = await import("@easel/editor-core");
  return coreList();
}

export async function loadFont(family: string, style = "Regular"): Promise<ArrayBuffer | null> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const {
        getFontProvider: getProvider,
        styleToWeight: sw,
        loadFont: _coreLoad,
      } = await import("@easel/editor-core");
      const data = await invoke<number[]>("load_system_font", { family, style });
      const buffer = new Uint8Array(data).buffer;

      const provider = getProvider();
      if (provider) provider.registerFont(buffer, family);

      const weight = sw(style);
      const italic = style.toLowerCase().includes("italic") ? "italic" : "normal";
      const face = new FontFace(family, buffer, {
        weight: String(weight),
        style: italic,
      });
      await face.load();
      document.fonts.add(face);

      return buffer;
    } catch {
      const { loadFont: coreLoad } = await import("@easel/editor-core");
      return coreLoad(family, style);
    }
  }

  const { loadFont: coreLoad } = await import("@easel/editor-core");
  return coreLoad(family, style);
}
