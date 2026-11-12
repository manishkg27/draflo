import { useState, useEffect, useRef, useCallback } from "react";
import "@excalidraw/excalidraw/index.css";
import { Excalidraw as Draflo } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import Sidebar from "./Sidebar";
import "./Sidebar.css";
import { type Drawing, saveDrawing, getDrawing } from "./db";

// Auto-save debounce delay in milliseconds
const AUTOSAVE_DELAY = 1500;

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeDrawing, setActiveDrawing] = useState<Drawing | null>(null);
  const [saving, setSaving] = useState(false);

  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDrawingRef = useRef<Drawing | null>(null);

  // Keep ref in sync so the autosave closure always has the latest drawing id
  useEffect(() => {
    activeDrawingRef.current = activeDrawing;
  }, [activeDrawing]);

  // ─── Auto-save logic ───────────────────────────────────────────────────────

  const scheduleAutosave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      const drawing = activeDrawingRef.current;
      const api = excalidrawApiRef.current;
      if (!drawing || !api) return;

      setSaving(true);
      try {
        const elements = api.getSceneElements();
        const appState = api.getAppState();
        const files = api.getFiles();

        await saveDrawing(
          drawing.id,
          elements as unknown[],
          {
            viewBackgroundColor: appState.viewBackgroundColor,
            gridSize: appState.gridSize,
            zoom: appState.zoom,
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
          } as Record<string, unknown>,
          files as unknown as Record<string, unknown>,
        );
      } finally {
        setSaving(false);
      }
    }, AUTOSAVE_DELAY);
  }, []);

  // ─── When user picks a drawing from sidebar ────────────────────────────────

  const handleSelectDrawing = useCallback(
    async (drawing: Drawing) => {
      // Save current drawing immediately before switching
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        const current = activeDrawingRef.current;
        const api = excalidrawApiRef.current;
        if (current && api) {
          const elements = api.getSceneElements();
          const appState = api.getAppState();
          const files = api.getFiles();
          await saveDrawing(
            current.id,
            elements as unknown[],
            {
              viewBackgroundColor: appState.viewBackgroundColor,
              gridSize: appState.gridSize,
              zoom: appState.zoom,
              scrollX: appState.scrollX,
              scrollY: appState.scrollY,
            } as Record<string, unknown>,
            files as unknown as Record<string, unknown>,
          );
        }
      }

      // Reload fresh from DB to get latest saved state
      const fresh = await getDrawing(drawing.id);
      setActiveDrawing(fresh ?? drawing);
    },
    [],
  );

  // ─── Restore scene when activeDrawing changes ──────────────────────────────

  useEffect(() => {
    const api = excalidrawApiRef.current;
    if (!api || !activeDrawing) return;

    api.updateScene({
      elements: (activeDrawing.elements as Parameters<ExcalidrawImperativeAPI["updateScene"]>[0]["elements"]) ?? [],
      appState: activeDrawing.appState as Parameters<ExcalidrawImperativeAPI["updateScene"]>[0]["appState"],
    });

    if (activeDrawing.files && Object.keys(activeDrawing.files).length > 0) {
      api.addFiles(Object.values(activeDrawing.files) as Parameters<ExcalidrawImperativeAPI["addFiles"]>[0]);
    }
  }, [activeDrawing]);

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────
  //
  // WHY UNDO BREAKS even with handleKeyboardGlobally:
  //   Excalidraw's onKeyDown has this guard (confirmed in source):
  //
  //     if (isWritableElement(event.target) && event.key !== KEYS.ESCAPE) {
  //       return; // bails out — skips undo, redo, everything
  //     }
  //
  //   When any sidebar <input> (search box, rename field) has focus,
  //   event.target IS that input → isWritableElement returns true → undo skipped.
  //   Redo seemed to "work" only when focus happened to be elsewhere already.
  //
  // FIX (capture phase, highest priority):
  //   Intercept Ctrl+Z/Shift+Z BEFORE Excalidraw's document listener fires.
  //   If event.target is a writable sidebar element, blur it and re-dispatch
  //   the keydown on the canvas — now event.target is the canvas (not writable)
  //   so Excalidraw's guard passes and undo/redo execute normally.

  useEffect(() => {
    const isWritable = (el: EventTarget | null): el is HTMLElement => {
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
      if (e.key === "s") {
        if (isWritable(e.target)) return; // let browser handle in sidebar inputs
        e.preventDefault();
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        const drawing = activeDrawingRef.current;
        const api = excalidrawApiRef.current;
        if (!drawing || !api) return;
        setSaving(true);
        const elements = api.getSceneElements();
        const appState = api.getAppState();
        const files = api.getFiles();
        saveDrawing(
          drawing.id,
          elements as unknown[],
          {
            viewBackgroundColor: appState.viewBackgroundColor,
            gridSize: appState.gridSize,
          } as Record<string, unknown>,
          files as unknown as Record<string, unknown>,
        ).finally(() => setSaving(false));
        return;
      }

      // ── Ctrl+Z (undo) / Ctrl+Shift+Z or Ctrl+Y (redo) ────────────────────
      const isUndoRedo =
        (e.key === "z" && !e.shiftKey) ||  // Ctrl+Z
        (e.key === "z" && e.shiftKey) ||    // Ctrl+Shift+Z
        e.key === "y";                       // Ctrl+Y (Windows redo)
      if (!isUndoRedo) return;

      // Only intervene when a sidebar input has stolen focus.
      // If event.target is already the canvas or body, Excalidraw handles it.
      if (!isWritable(e.target)) return;

      // Sidebar input has focus → Excalidraw would bail. Intercept.
      e.preventDefault();
      e.stopImmediatePropagation();

      // Blur the input so it no longer appears as the active element
      (e.target as HTMLElement).blur();

      // Re-dispatch on the Excalidraw canvas.
      // event.target will now be the canvas (not writable) so the guard passes.
      const canvasEl = document.querySelector<HTMLElement>(".excalidraw canvas");
      if (canvasEl) {
        canvasEl.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: e.key,
            code: e.code,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    };

    // Capture phase: fires before Excalidraw's document-level listener
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  return (
    <div className="app-wrapper">
      <Sidebar
        activeDrawingId={activeDrawing?.id ?? null}
        onSelectDrawing={handleSelectDrawing}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        saving={saving}
      />

      <div className="canvas-area">
        {activeDrawing ? (
          <Draflo
            key={activeDrawing.id}
            // ✅ This is the fix: Excalidraw listens for keyboard events on
            // `document` globally instead of only when its canvas has focus.
            // Ctrl+Z, Ctrl+Shift+Z, and all other shortcuts now work even when
            // the sidebar panel is focused.
            handleKeyboardGlobally
            excalidrawAPI={(api) => {
              excalidrawApiRef.current = api;
              // Restore scene after API is ready
              setTimeout(() => {
                api.updateScene({
                  elements: (activeDrawing.elements as Parameters<ExcalidrawImperativeAPI["updateScene"]>[0]["elements"]) ?? [],
                  appState: activeDrawing.appState as Parameters<ExcalidrawImperativeAPI["updateScene"]>[0]["appState"],
                });
                if (activeDrawing.files && Object.keys(activeDrawing.files).length > 0) {
                  api.addFiles(Object.values(activeDrawing.files) as Parameters<ExcalidrawImperativeAPI["addFiles"]>[0]);
                }
              }, 0);
            }}
            onChange={scheduleAutosave}
          />
        ) : (
          <WelcomeScreen onNewDrawing={() => {
            window.dispatchEvent(new CustomEvent("draflo:new-drawing"));
          }} />
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 16,
        background: "#16171d",
        color: "#6b7280",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3a3c4a" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
      </svg>
      <div style={{ fontSize: 18, color: "#c8cad8", fontWeight: 600 }}>Draflo</div>
      <div style={{ fontSize: 13 }}>Select a drawing from the sidebar, or create a new one.</div>
      <button
        onClick={onNewDrawing}
        style={{
          marginTop: 8,
          background: "#7c3aed",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "9px 20px",
          fontSize: 13,
          cursor: "pointer",
          fontWeight: 500,
        }}
      >
        + New Drawing
      </button>
      <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4 }}>
        Tip: Press <kbd style={{ background: "#2b2d3a", padding: "1px 5px", borderRadius: 4, color: "#9ca3b0" }}>Ctrl+S</kbd> to save instantly
      </div>
    </div>
  );
}

export default App;
