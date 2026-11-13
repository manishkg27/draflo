/**
 * db.ts — IndexedDB layer for Draflo
 *
 * Stores:
 *   folders  : { id, name, createdAt, updatedAt }
 *   drawings : { id, folderId, name, elements, appState, files, createdAt, updatedAt }
 *   settings : { key, value, updatedAt }  (global editor preferences: tool, pen settings, theme, last opened file)
 */

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface Drawing {
  id: string;
  folderId: string | null; // null = root (no folder)
  name: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface GlobalSettings {
  theme?: "dark" | "light";
  lastActiveDrawingId?: string | null;
  activeTool?: {
    type: string;
    lastActiveTool?: unknown;
    locked?: boolean;
    customType?: string | null;
  };
  penMode?: boolean;
  currentItemStrokeColor?: string;
  currentItemBackgroundColor?: string;
  currentItemFillStyle?: string;
  currentItemStrokeWidth?: number;
  currentItemStrokeStyle?: string;
  currentItemRoughness?: number;
  currentItemOpacity?: number;
  currentItemFontFamily?: number;
  currentItemFontSize?: number;
  currentItemTextAlign?: string;
  currentItemStartArrowhead?: unknown;
  currentItemEndArrowhead?: unknown;
  currentItemRoundness?: unknown;
  currentItemArrowType?: string;
  [key: string]: unknown;
}

const DB_NAME = "draflo_db";
const DB_VERSION = 2;

let dbInstance: IDBDatabase | null = null;

function safeClone<T>(val: T): T {
  try {
    return JSON.parse(JSON.stringify(val));
  } catch {
    return val;
  }
}

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains("folders")) {
        const foldersStore = db.createObjectStore("folders", { keyPath: "id" });
        foldersStore.createIndex("name", "name", { unique: false });
      }

      if (!db.objectStoreNames.contains("drawings")) {
        const drawingsStore = db.createObjectStore("drawings", { keyPath: "id" });
        drawingsStore.createIndex("folderId", "folderId", { unique: false });
        drawingsStore.createIndex("name", "name", { unique: false });
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };

    req.onsuccess = () => {
      dbInstance = req.result;
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    req.onerror = () => reject(req.error);
  });
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Folders ─────────────────────────────────────────────────────────────────

export function isFolderNameTaken(
  name: string,
  folders: Folder[],
  excludeId?: string
): boolean {
  const trimmed = name.trim().toLowerCase();
  return folders.some(
    (f) => f.id !== excludeId && f.name.trim().toLowerCase() === trimmed
  );
}

export function isDrawingNameTaken(
  name: string,
  folderId: string | null,
  drawings: Drawing[],
  excludeId?: string
): boolean {
  const trimmed = name.trim().toLowerCase();
  return drawings.some(
    (d) =>
      d.id !== excludeId &&
      d.folderId === folderId &&
      d.name.trim().toLowerCase() === trimmed
  );
}

export function getUniqueDrawingName(
  baseName: string,
  folderId: string | null,
  drawings: Drawing[]
): string {
  const trimmed = baseName.trim() || "Untitled Drawing";
  if (!isDrawingNameTaken(trimmed, folderId, drawings)) {
    return trimmed;
  }
  let counter = 2;
  while (isDrawingNameTaken(`${trimmed} ${counter}`, folderId, drawings)) {
    counter++;
  }
  return `${trimmed} ${counter}`;
}

export function getUniqueFolderName(
  baseName: string,
  folders: Folder[]
): string {
  const trimmed = baseName.trim() || "Untitled Folder";
  if (!isFolderNameTaken(trimmed, folders)) {
    return trimmed;
  }
  let counter = 2;
  while (isFolderNameTaken(`${trimmed} ${counter}`, folders)) {
    counter++;
  }
  return `${trimmed} ${counter}`;
}

export async function getAllFolders(): Promise<Folder[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("folders", "readonly");
    const req = tx.objectStore("folders").getAll();
    req.onsuccess = () => resolve((req.result as Folder[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function createFolder(name: string): Promise<Folder> {
  const db = await openDB();
  const trimmed = name.trim() || "Untitled Folder";
  const existingFolders = await getAllFolders();
  if (isFolderNameTaken(trimmed, existingFolders)) {
    throw new Error(`A folder named "${trimmed}" already exists.`);
  }
  const folder: Folder = {
    id: generateId(),
    name: trimmed,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction("folders", "readwrite");
    tx.objectStore("folders").put(folder);
    tx.oncomplete = () => resolve(folder);
    tx.onerror = () => reject(tx.error);
  });
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const db = await openDB();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name cannot be empty.");
  const existingFolders = await getAllFolders();
  if (isFolderNameTaken(trimmed, existingFolders, id)) {
    throw new Error(`A folder named "${trimmed}" already exists.`);
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction("folders", "readwrite");
    const store = tx.objectStore("folders");
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const folder = getReq.result as Folder;
      if (!folder) return reject(new Error("Folder not found"));
      folder.name = trimmed;
      folder.updatedAt = Date.now();
      store.put(folder);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteFolder(id: string): Promise<void> {
  const db = await openDB();
  const drawings = await getDrawingsByFolder(id);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["folders", "drawings"], "readwrite");
    tx.objectStore("folders").delete(id);
    for (const d of drawings) {
      tx.objectStore("drawings").delete(d.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Drawings ─────────────────────────────────────────────────────────────────

export async function getAllDrawings(): Promise<Drawing[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drawings", "readonly");
    const req = tx.objectStore("drawings").getAll();
    req.onsuccess = () => resolve((req.result as Drawing[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getDrawingsByFolder(folderId: string | null): Promise<Drawing[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drawings", "readonly");
    const index = tx.objectStore("drawings").index("folderId");
    const req = index.getAll(folderId);
    req.onsuccess = () => resolve((req.result as Drawing[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getDrawing(id: string): Promise<Drawing | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drawings", "readonly");
    const req = tx.objectStore("drawings").get(id);
    req.onsuccess = () => resolve((req.result as Drawing) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function createDrawing(
  name: string,
  folderId: string | null,
  elements: unknown[] = [],
  appState: Record<string, unknown> = {},
  files: Record<string, unknown> = {},
): Promise<Drawing> {
  const db = await openDB();
  const trimmed = name.trim() || "Untitled Drawing";
  const existingInScope = await getDrawingsByFolder(folderId);
  if (isDrawingNameTaken(trimmed, folderId, existingInScope)) {
    throw new Error(
      `A drawing named "${trimmed}" already exists in ${folderId ? "this folder" : "root"}.`
    );
  }
  const drawing: Drawing = {
    id: generateId(),
    folderId,
    name: trimmed,
    elements: safeClone(elements),
    appState: safeClone(appState),
    files: safeClone(files),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drawings", "readwrite");
    tx.objectStore("drawings").put(drawing);
    tx.oncomplete = () => resolve(drawing);
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveDrawing(
  id: string,
  elements: unknown[],
  appState: Record<string, unknown>,
  files: Record<string, unknown>,
): Promise<void> {
  const db = await openDB();
  const cleanElements = safeClone(elements || []);
  const cleanAppState = safeClone(appState || {});
  const cleanFiles = safeClone(files || {});

  return new Promise((resolve, reject) => {
    const tx = db.transaction("drawings", "readwrite");
    const store = tx.objectStore("drawings");

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);

    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const drawing = getReq.result as Drawing | undefined;
      if (drawing) {
        drawing.elements = cleanElements;
        drawing.appState = cleanAppState;
        drawing.files = cleanFiles;
        drawing.updatedAt = Date.now();
        store.put(drawing);
      } else {
        // If not found in store, create a record to prevent data loss
        const newDrawing: Drawing = {
          id,
          name: "Untitled Drawing",
          folderId: null,
          elements: cleanElements,
          appState: cleanAppState,
          files: cleanFiles,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        store.put(newDrawing);
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function renameDrawing(id: string, name: string): Promise<void> {
  const db = await openDB();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Drawing name cannot be empty.");
  const current = await getDrawing(id);
  if (!current) throw new Error("Drawing not found");
  const existingInScope = await getDrawingsByFolder(current.folderId);
  if (isDrawingNameTaken(trimmed, current.folderId, existingInScope, id)) {
    throw new Error(
      `A drawing named "${trimmed}" already exists in ${current.folderId ? "this folder" : "root"}.`
    );
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drawings", "readwrite");
    const store = tx.objectStore("drawings");
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const drawing = getReq.result as Drawing;
      if (!drawing) return reject(new Error("Drawing not found"));
      drawing.name = trimmed;
      drawing.updatedAt = Date.now();
      store.put(drawing);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function moveDrawing(id: string, folderId: string | null): Promise<void> {
  const db = await openDB();
  const current = await getDrawing(id);
  if (!current) throw new Error("Drawing not found");
  if (current.folderId === folderId) return;
  const existingInDest = await getDrawingsByFolder(folderId);
  if (isDrawingNameTaken(current.name, folderId, existingInDest, id)) {
    throw new Error(
      `A drawing named "${current.name}" already exists in the destination folder.`
    );
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drawings", "readwrite");
    const store = tx.objectStore("drawings");
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const drawing = getReq.result as Drawing;
      if (!drawing) return reject(new Error("Drawing not found"));
      drawing.folderId = folderId;
      drawing.updatedAt = Date.now();
      store.put(drawing);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteDrawing(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drawings", "readwrite");
    tx.objectStore("drawings").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Global Settings & Last-Used State ────────────────────────────────────────

const GLOBAL_SETTINGS_KEY = "global_editor_settings";

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const db = await openDB();
  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains("settings")) {
        resolve({});
        return;
      }
      const tx = db.transaction("settings", "readonly");
      const store = tx.objectStore("settings");
      const req = store.get(GLOBAL_SETTINGS_KEY);
      req.onsuccess = () => {
        resolve((req.result?.value as GlobalSettings) || {});
      };
      req.onerror = () => resolve({});
    } catch {
      resolve({});
    }
  });
}

export async function saveGlobalSettings(settings: Partial<GlobalSettings>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      if (!db.objectStoreNames.contains("settings")) {
        resolve();
        return;
      }
      const tx = db.transaction("settings", "readwrite");
      const store = tx.objectStore("settings");
      const getReq = store.get(GLOBAL_SETTINGS_KEY);
      getReq.onsuccess = () => {
        const current = (getReq.result?.value as GlobalSettings) || {};
        const updated = {
          ...current,
          ...safeClone(settings),
        };
        store.put({
          key: GLOBAL_SETTINGS_KEY,
          value: updated,
          updatedAt: Date.now(),
        });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Extracts tool, pen, stroke, color, and font settings from Excalidraw appState
 * to be saved and applied globally across all files.
 */
export function extractToolAndPenSettings(appState: Record<string, unknown>): Partial<GlobalSettings> {
  const settings: Partial<GlobalSettings> = {};

  if (appState.activeTool) {
    const at = appState.activeTool as Record<string, unknown>;
    settings.activeTool = {
      type: String(at.type || "selection"),
      locked: Boolean(at.locked),
      lastActiveTool: at.lastActiveTool ? safeClone(at.lastActiveTool) : null,
      customType: at.customType ? String(at.customType) : null,
    };
  }

  if (typeof appState.penMode === "boolean") {
    settings.penMode = appState.penMode;
  }

  if (typeof appState.currentItemStrokeColor === "string") {
    settings.currentItemStrokeColor = appState.currentItemStrokeColor;
  }

  if (typeof appState.currentItemBackgroundColor === "string") {
    settings.currentItemBackgroundColor = appState.currentItemBackgroundColor;
  }

  if (typeof appState.currentItemFillStyle === "string") {
    settings.currentItemFillStyle = appState.currentItemFillStyle;
  }

  if (typeof appState.currentItemStrokeWidth === "number") {
    settings.currentItemStrokeWidth = appState.currentItemStrokeWidth;
  }

  if (typeof appState.currentItemStrokeStyle === "string") {
    settings.currentItemStrokeStyle = appState.currentItemStrokeStyle;
  }

  if (typeof appState.currentItemRoughness === "number") {
    settings.currentItemRoughness = appState.currentItemRoughness;
  }

  if (typeof appState.currentItemOpacity === "number") {
    settings.currentItemOpacity = appState.currentItemOpacity;
  }

  if (typeof appState.currentItemFontFamily === "number") {
    settings.currentItemFontFamily = appState.currentItemFontFamily;
  }

  if (typeof appState.currentItemFontSize === "number") {
    settings.currentItemFontSize = appState.currentItemFontSize;
  }

  if (typeof appState.currentItemTextAlign === "string") {
    settings.currentItemTextAlign = appState.currentItemTextAlign;
  }

  if (appState.currentItemStartArrowhead !== undefined) {
    settings.currentItemStartArrowhead = appState.currentItemStartArrowhead;
  }

  if (appState.currentItemEndArrowhead !== undefined) {
    settings.currentItemEndArrowhead = appState.currentItemEndArrowhead;
  }

  if (appState.currentItemRoundness !== undefined) {
    settings.currentItemRoundness = appState.currentItemRoundness;
  }

  if (typeof appState.currentItemArrowType === "string") {
    settings.currentItemArrowType = appState.currentItemArrowType;
  }

  return settings;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
