/**
 * db.ts — IndexedDB layer for Draflo
 *
 * Stores:
 *   folders  : { id, name, createdAt, updatedAt }
 *   drawings : { id, folderId, name, elements, appState, files, createdAt, updatedAt }
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

const DB_NAME = "draflo_db";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
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
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Folders ─────────────────────────────────────────────────────────────────

export async function getAllFolders(): Promise<Folder[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("folders", "readonly");
    const req = tx.objectStore("folders").getAll();
    req.onsuccess = () => resolve(req.result as Folder[]);
    req.onerror = () => reject(req.error);
  });
}

export async function createFolder(name: string): Promise<Folder> {
  const db = await openDB();
  const folder: Folder = {
    id: generateId(),
    name: name.trim() || "Untitled Folder",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction("folders", "readwrite");
    const req = tx.objectStore("folders").put(folder);
    req.onsuccess = () => resolve(folder);
    req.onerror = () => reject(req.error);
  });
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("folders", "readwrite");
    const store = tx.objectStore("folders");
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const folder = getReq.result as Folder;
      if (!folder) return reject(new Error("Folder not found"));
      folder.name = name.trim() || folder.name;
      folder.updatedAt = Date.now();
      const putReq = store.put(folder);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function deleteFolder(id: string): Promise<void> {
  const db = await openDB();
  // Also delete all drawings in this folder
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
    req.onsuccess = () => resolve(req.result as Drawing[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getDrawingsByFolder(folderId: string | null): Promise<Drawing[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drawings", "readonly");
    const index = tx.objectStore("drawings").index("folderId");
    const req = index.getAll(folderId);
    req.onsuccess = () => resolve(req.result as Drawing[]);
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
  const drawing: Drawing = {
    id: generateId(),
    folderId,
    name: name.trim() || "Untitled Drawing",
    elements,
    appState,
    files,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drawings", "readwrite");
    const req = tx.objectStore("drawings").put(drawing);
    req.onsuccess = () => resolve(drawing);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDrawing(
  id: string,
  elements: unknown[],
  appState: Record<string, unknown>,
  files: Record<string, unknown>,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drawings", "readwrite");
    const store = tx.objectStore("drawings");
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const drawing = getReq.result as Drawing;
      if (!drawing) return reject(new Error("Drawing not found"));
      drawing.elements = elements;
      drawing.appState = appState;
      drawing.files = files;
      drawing.updatedAt = Date.now();
      const putReq = store.put(drawing);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function renameDrawing(id: string, name: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drawings", "readwrite");
    const store = tx.objectStore("drawings");
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const drawing = getReq.result as Drawing;
      if (!drawing) return reject(new Error("Drawing not found"));
      drawing.name = name.trim() || drawing.name;
      drawing.updatedAt = Date.now();
      const putReq = store.put(drawing);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function moveDrawing(id: string, folderId: string | null): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drawings", "readwrite");
    const store = tx.objectStore("drawings");
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const drawing = getReq.result as Drawing;
      if (!drawing) return reject(new Error("Drawing not found"));
      drawing.folderId = folderId;
      drawing.updatedAt = Date.now();
      const putReq = store.put(drawing);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function deleteDrawing(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drawings", "readwrite");
    const req = tx.objectStore("drawings").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
