import { useState, useEffect, useRef, useCallback } from "react";
import "@excalidraw/excalidraw/index.css";
import { Excalidraw as Draflo } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, BinaryFiles } from "@excalidraw/excalidraw/types";
import Sidebar from "./Sidebar";
import "./Sidebar.css";
import {
  type Drawing,
  type GlobalSettings,
  saveDrawing,
  getDrawing,
  getGlobalSettings,
  saveGlobalSettings,
  extractToolAndPenSettings,
} from "./db";

// Auto-save debounce delay in milliseconds
const AUTOSAVE_DELAY = 1000;

interface SceneSnapshot {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeDrawing, setActiveDrawing] = useState<Drawing | null>(null);
  const [saving, setSaving] = useState(false);

  // Theme state: "dark" or "light"
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      const saved = localStorage.getItem("draflo-theme");
      if (saved === "light" || saved === "dark") return saved;
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDrawingRef = useRef<Drawing | null>(null);
  const themeRef = useRef<"dark" | "light">(theme);

  // Global settings ref (tool, pen, colors, stroke, theme, lastActiveDrawingId)
  const globalSettingsRef = useRef<GlobalSettings>({});

  // Store latest scene changes per drawing ID in memory immediately (0ms lag)
  const latestScenesRef = useRef<Map<string, SceneSnapshot>>(new Map());

  // Keep refs in sync
  useEffect(() => {
    activeDrawingRef.current = activeDrawing;
  }, [activeDrawing]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  // Sync theme with DOM, localStorage, and meta color-scheme
  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("draflo-theme", theme);
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.setAttribute("content", theme);
    } catch (e) {
      console.error("Failed to update theme storage", e);
    }
  }, [theme]);

  // ─── Load Global Settings from IndexedDB on startup ───────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const settings = await getGlobalSettings();
        if (!mounted) return;
        globalSettingsRef.current = settings;

        // 1. Restore global theme
        if (settings.theme === "dark" || settings.theme === "light") {
          setTheme(settings.theme);
        }

        // 2. Restore last active drawing so user starts where they left off
        if (settings.lastActiveDrawingId) {
          const drawing = await getDrawing(settings.lastActiveDrawingId);
          if (mounted && drawing) {
            setActiveDrawing(drawing);
          }
        }
      } catch (err) {
        console.error("Failed to load global settings from IndexedDB:", err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      globalSettingsRef.current = {
        ...globalSettingsRef.current,
        theme: next,
      };
      saveGlobalSettings({ theme: next }).catch(console.error);
      return next;
    });
  }, []);

  // ─── Flush pending saves to IndexedDB ──────────────────────────────────────

  const flushPendingSaves = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const pending = Array.from(latestScenesRef.current.entries());
    setSaving(true);
    try {
      for (const [id, scene] of pending) {
        await saveDrawing(id, scene.elements, scene.appState, scene.files);
      }
      latestScenesRef.current.clear();

      if (globalSettingsRef.current && Object.keys(globalSettingsRef.current).length > 0) {
        await saveGlobalSettings(globalSettingsRef.current);
      }
    } catch (err) {
      console.error("Failed to flush pending saves to IndexedDB:", err);
    } finally {
      setSaving(false);
    }
  }, []);

  // ─── Scene change handler from Excalidraw ──────────────────────────────────

  const handleSceneChange = useCallback(
    (
      drawingId: string,
      elements: readonly unknown[],
      appState: Record<string, unknown>,
      files: Record<string, unknown>,
    ) => {
      const drawingTheme = (appState.theme as "dark" | "light") || themeRef.current;
      const toolAndPenSettings = extractToolAndPenSettings(appState);

      // Track global editor settings (tool, pen mode, stroke color, stroke width, etc.)
      globalSettingsRef.current = {
        ...globalSettingsRef.current,
        ...toolAndPenSettings,
        theme: drawingTheme,
        lastActiveDrawingId: drawingId,
      };

      // 1. Store scene in memory immediately for this exact drawing ID with theme included
      latestScenesRef.current.set(drawingId, {
        elements: elements as unknown[],
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          gridSize: appState.gridSize,
          zoom: appState.zoom,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          theme: drawingTheme,
        },
        files: files || {},
      });

      // If user switched theme within Excalidraw canvas menu, synchronize our app theme!
      if (appState.theme && (appState.theme === "dark" || appState.theme === "light")) {
        if (appState.theme !== themeRef.current) {
          setTheme(appState.theme as "dark" | "light");
        }
      }

      // 2. Schedule debounced save to IndexedDB (drawing + global settings)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaving(true);

      saveTimerRef.current = setTimeout(async () => {
        const scene = latestScenesRef.current.get(drawingId);
        try {
          if (scene) {
            await saveDrawing(drawingId, scene.elements, scene.appState, scene.files);
            latestScenesRef.current.delete(drawingId);
          }
          await saveGlobalSettings({
            ...toolAndPenSettings,
            theme: drawingTheme,
            lastActiveDrawingId: drawingId,
          });
        } catch (err) {
          console.error("Auto-save failed:", err);
        } finally {
          setSaving(false);
        }
      }, AUTOSAVE_DELAY);
    },
    [],
  );

  // ─── Switch / select drawing ───────────────────────────────────────────────

  const handleSelectDrawing = useCallback(
    async (drawing: Drawing) => {
      // 1. Before switching away, immediately persist any pending work
      await flushPendingSaves();

      // 2. Reload fresh drawing state directly from IndexedDB
      const fresh = await getDrawing(drawing.id);
      const target = fresh ?? drawing;
      setActiveDrawing(target);

      // 3. Persist last active drawing ID globally in IndexedDB
      globalSettingsRef.current = {
        ...globalSettingsRef.current,
        lastActiveDrawingId: target.id,
      };
      saveGlobalSettings({ lastActiveDrawingId: target.id }).catch(console.error);

      // 4. If drawing has a stored theme preference, adopt it
      if (target.appState?.theme && (target.appState.theme === "dark" || target.appState.theme === "light")) {
        setTheme(target.appState.theme as "dark" | "light");
      }
    },
    [flushPendingSaves],
  );

  const handleActiveDrawingDeleted = useCallback(() => {
    setActiveDrawing(null);
    globalSettingsRef.current = {
      ...globalSettingsRef.current,
      lastActiveDrawingId: null,
    };
    saveGlobalSettings({ lastActiveDrawingId: null }).catch(console.error);
  }, []);

  // ─── Keyboard shortcuts (Ctrl+S, Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y) ─────────────

  useEffect(() => {
    const isEditable = (el: EventTarget | null): boolean => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };

    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      // ── Ctrl+S: instant save ──────────────────────────────────────────────
      if (e.key === "s" || e.key === "S") {
        if (isEditable(e.target)) return;
        e.preventDefault();
        flushPendingSaves();
        return;
      }

      // If user is actively typing in an input/textarea, let native undo work there
      if (isEditable(e.target)) return;

      const keyLower = e.key.toLowerCase();
      const isZ = keyLower === "z" || e.code === "KeyZ";
      const isY = keyLower === "y" || e.code === "KeyY";

      // ── Ctrl+Z: Undo ──────────────────────────────────────────────────────
      if (isZ && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();

        const undoBtn = document.querySelector<HTMLButtonElement>(
          '.undo-button-container button, [data-testid="undo-button"], button[aria-label="Undo"], button[title*="Undo"], button[title*="undo"]'
        );
        if (undoBtn && !undoBtn.disabled) {
          undoBtn.click();
        }
        return;
      }

      // ── Ctrl+Shift+Z / Ctrl+Y: Redo ───────────────────────────────────────
      if ((isZ && e.shiftKey) || isY) {
        e.preventDefault();
        e.stopPropagation();

        const redoBtn = document.querySelector<HTMLButtonElement>(
          '.redo-button-container button, [data-testid="button-redo"], button[aria-label="Redo"], button[title*="Redo"], button[title*="redo"]'
        );
        if (redoBtn && !redoBtn.disabled) {
          redoBtn.click();
        }
        return;
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [flushPendingSaves]);

  // Ensure any unsaved changes are written before the user leaves/refreshes the tab
  useEffect(() => {
    const beforeUnloadHandler = () => {
      flushPendingSaves();
    };
    window.addEventListener("beforeunload", beforeUnloadHandler);
    return () => window.removeEventListener("beforeunload", beforeUnloadHandler);
  }, [flushPendingSaves]);

  return (
    <div className="app-wrapper">
      <Sidebar
        activeDrawingId={activeDrawing?.id ?? null}
        onSelectDrawing={handleSelectDrawing}
        onActiveDrawingDeleted={handleActiveDrawingDeleted}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        saving={saving}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <div className="canvas-area">
        {activeDrawing ? (
          <Draflo
            key={activeDrawing.id}
            theme={theme}
            initialData={{
              elements: (activeDrawing.elements as Parameters<ExcalidrawImperativeAPI["updateScene"]>[0]["elements"]) || [],
              appState: {
                ...(activeDrawing.appState || {}),
                isLoading: false,
                theme,
                // Overlay global tool and pen settings so you always continue where you left off
                ...extractToolAndPenSettings(globalSettingsRef.current as Record<string, unknown>),
              } as unknown as Parameters<ExcalidrawImperativeAPI["updateScene"]>[0]["appState"],
              files: (activeDrawing.files as unknown as BinaryFiles) || {},
            }}
            handleKeyboardGlobally
            excalidrawAPI={(api) => {
              excalidrawApiRef.current = api;
            }}
            onChange={(elements, appState, files) => {
              handleSceneChange(
                activeDrawing.id,
                elements,
                appState as unknown as Record<string, unknown>,
                files as unknown as Record<string, unknown>,
              );
            }}
          />
        ) : (
          <WelcomeScreen
            onNewDrawing={() => {
              window.dispatchEvent(new CustomEvent("draflo:new-drawing"));
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Welcome / empty state screen ─────────────────────────────────────────────

function WelcomeScreen({ onNewDrawing }: { onNewDrawing: () => void }) {
  useEffect(() => {
    const handler = () => onNewDrawing();
    window.addEventListener("draflo:new-drawing", handler);
    return () => window.removeEventListener("draflo:new-drawing", handler);
  }, [onNewDrawing]);

  return (
    <div className="welcome-screen">
      <div className="welcome-icon-box">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
      </div>
      <div className="welcome-title">Draflo</div>
      <div className="welcome-subtitle">Select a drawing from the sidebar, or create a new one to start sketching.</div>
      <button className="welcome-btn" onClick={onNewDrawing}>
        + New Drawing
      </button>
      <div className="welcome-tip">
        Tip: Press <kbd className="welcome-kbd">Ctrl+S</kbd> to save instantly to IndexedDB
      </div>
    </div>
  );
}

export default App;
