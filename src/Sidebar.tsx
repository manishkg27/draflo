import { useState, useEffect, useRef, useCallback } from "react";
import "./Sidebar.css";
import {
  type Folder,
  type Drawing,
  getAllFolders,
  getAllDrawings,
  createFolder,
  renameFolder,
  deleteFolder,
  createDrawing,
  renameDrawing,
  deleteDrawing,
  moveDrawing,
  formatDate,
  isDrawingNameTaken,
  isFolderNameTaken,
  getUniqueDrawingName,
  getUniqueFolderName,
} from "./db";

// ─── SVG Icons (inline, no extra dep) ────────────────────────────────────────

function IconFolder({ open }: { open?: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconDots() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

function IconPanelLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconMove() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5 9 2 12 5 15" />
      <polyline points="9 5 12 2 15 5" />
      <polyline points="15 19 12 22 9 19" />
      <polyline points="19 9 22 12 19 15" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="12" y1="2" x2="12" y2="22" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CtxMenu {
  x: number;
  y: number;
  kind: "folder" | "drawing";
  id: string;
}

interface ModalState {
  kind: "new-folder" | "new-drawing" | "rename-folder" | "rename-drawing" | "move-drawing" | "confirm-delete";
  id?: string;
  defaultValue?: string;
  folderId?: string | null;
  message?: string;
  onConfirm?: () => void;
}

interface SidebarProps {
  activeDrawingId: string | null;
  onSelectDrawing: (drawing: Drawing) => void;
  onActiveDrawingDeleted?: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  saving?: boolean;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
}

// ─── Context Menu Component ───────────────────────────────────────────────────

function ContextMenu({
  menu,
  folders,
  onClose,
  onRenameFolder,
  onDeleteFolder,
  onNewDrawingInFolder,
  onRenameDrawing,
  onMoveDrawing,
  onDeleteDrawing,
}: {
  menu: CtxMenu;
  folders: Folder[];
  onClose: () => void;
  onRenameFolder: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onNewDrawingInFolder: (folderId: string) => void;
  onRenameDrawing: (id: string) => void;
  onMoveDrawing: (id: string) => void;
  onDeleteDrawing: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div className="ctx-menu" ref={ref} style={{ top: menu.y, left: menu.x }}>
      {menu.kind === "folder" ? (
        <>
          <button onClick={() => { onNewDrawingInFolder(menu.id); onClose(); }}>
            <IconPlus /> New drawing here
          </button>
          <button onClick={() => { onRenameFolder(menu.id); onClose(); }}>
            <IconEdit /> Rename folder
          </button>
          <div className="ctx-sep" />
          <button className="danger" onClick={() => { onDeleteFolder(menu.id); onClose(); }}>
            <IconTrash /> Delete folder
          </button>
        </>
      ) : (
        <>
          <button onClick={() => { onRenameDrawing(menu.id); onClose(); }}>
            <IconEdit /> Rename
          </button>
          {folders.length > 0 && (
            <button onClick={() => { onMoveDrawing(menu.id); onClose(); }}>
              <IconMove /> Move to folder
            </button>
          )}
          <div className="ctx-sep" />
          <button className="danger" onClick={() => { onDeleteDrawing(menu.id); onClose(); }}>
            <IconTrash /> Delete
          </button>
        </>
      )}
    </div>
  );
}

// ─── Modal Component ──────────────────────────────────────────────────────────

function Modal({
  modal,
  folders,
  onClose,
  onSubmit,
}: {
  modal: ModalState;
  folders: Folder[];
  onClose: () => void;
  onSubmit: (value: string) => Promise<string | null | void>;
}) {
  const [value, setValue] = useState(modal.defaultValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    setTimeout(() => (inputRef.current as HTMLElement)?.focus(), 50);
  }, []);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const err = await onSubmit(value);
      if (err) {
        setError(err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") onClose();
  };

  if (modal.kind === "confirm-delete") {
    return (
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal">
          <h3>Confirm Delete</h3>
          <p className="modal-description">{modal.message}</p>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-danger" onClick={() => modal.onConfirm?.()}>Delete</button>
          </div>
        </div>
      </div>
    );
  }

  if (modal.kind === "move-drawing") {
    return (
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal">
          <h3>Move Drawing to Folder</h3>
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={value}
            className={error ? "input-error" : ""}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
          >
            <option value="">— Root (no folder) —</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          {error && <div className="modal-error">{error}</div>}
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={submitting} onClick={handleSubmit}>Move</button>
          </div>
        </div>
      </div>
    );
  }

  const titles: Record<string, string> = {
    "new-folder": "New Folder",
    "new-drawing": "New Drawing",
    "rename-folder": "Rename Folder",
    "rename-drawing": "Rename Drawing",
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>{titles[modal.kind]}</h3>
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={value}
          className={error ? "input-error" : ""}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKey}
          placeholder={modal.kind.includes("folder") ? "Folder name" : "Drawing name"}
        />
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={submitting} onClick={handleSubmit}>
            {modal.kind.startsWith("rename") ? "Rename" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Sidebar Component ───────────────────────────────────────────────────

export default function Sidebar({
  activeDrawingId,
  onSelectDrawing,
  onActiveDrawingDeleted,
  collapsed,
  onToggleCollapse,
  saving = false,
  theme = "dark",
  onToggleTheme,
}: SidebarProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [search, setSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const reload = useCallback(async () => {
    const [f, d] = await Promise.all([getAllFolders(), getAllDrawings()]);
    setFolders(f.sort((a, b) => a.name.localeCompare(b.name)));
    setDrawings(d.sort((a, b) => b.updatedAt - a.updatedAt));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // ─── Context menu helpers ───────────────────────────────────────────────

  const openCtx = (e: React.MouseEvent, kind: "folder" | "drawing", id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, kind, id });
  };

  // ─── Folder actions ─────────────────────────────────────────────────────

  const handleNewFolder = () => setModal({ kind: "new-folder" });

  const handleNewDrawing = (folderId: string | null = null) =>
    setModal({ kind: "new-drawing", folderId });

  const handleRenameFolder = (id: string) => {
    const f = folders.find((x) => x.id === id);
    setModal({ kind: "rename-folder", id, defaultValue: f?.name ?? "" });
  };

  const handleDeleteFolder = (id: string) => {
    const f = folders.find((x) => x.id === id);
    const count = drawings.filter((d) => d.folderId === id).length;
    const containsActive = drawings.some((d) => d.folderId === id && d.id === activeDrawingId);
    setModal({
      kind: "confirm-delete",
      message: `Delete folder "${f?.name}"? This will also delete ${count} drawing(s) inside it. This cannot be undone.`,
      onConfirm: async () => {
        await deleteFolder(id);
        if (containsActive) {
          onActiveDrawingDeleted?.();
        }
        setModal(null);
        reload();
      },
    });
  };

  // ─── Drawing actions ────────────────────────────────────────────────────

  const handleRenameDrawing = (id: string) => {
    const d = drawings.find((x) => x.id === id);
    setModal({ kind: "rename-drawing", id, defaultValue: d?.name ?? "" });
  };

  const handleDeleteDrawing = (id: string) => {
    const d = drawings.find((x) => x.id === id);
    setModal({
      kind: "confirm-delete",
      message: `Delete drawing "${d?.name}"? This cannot be undone.`,
      onConfirm: async () => {
        await deleteDrawing(id);
        if (activeDrawingId === id) {
          onActiveDrawingDeleted?.();
        }
        setModal(null);
        reload();
      },
    });
  };

  const handleMoveDrawing = (id: string) =>
    setModal({ kind: "move-drawing", id, defaultValue: drawings.find((d) => d.id === id)?.folderId ?? "" });

  // ─── Modal submit with duplicate prevention ─────────────────────────────

  const handleModalSubmit = async (value: string): Promise<string | null | void> => {
    if (!modal) return;
    const trimmed = value.trim();

    try {
      switch (modal.kind) {
        case "new-folder": {
          const folderName = trimmed || getUniqueFolderName("Untitled Folder", folders);
          if (isFolderNameTaken(folderName, folders)) {
            return `A folder named "${folderName}" already exists.`;
          }
          await createFolder(folderName);
          break;
        }
        case "new-drawing": {
          const targetFolderId = modal.folderId ?? null;
          const drawingName = trimmed || getUniqueDrawingName("Untitled Drawing", targetFolderId, drawings);
          if (isDrawingNameTaken(drawingName, targetFolderId, drawings)) {
            return `A drawing named "${drawingName}" already exists in ${targetFolderId ? "this folder" : "root"}.`;
          }
          const d = await createDrawing(drawingName, targetFolderId);
          await reload();
          setModal(null);
          onSelectDrawing(d);
          if (modal.folderId) setOpenFolders((prev) => new Set([...prev, modal.folderId!]));
          return;
        }
        case "rename-folder": {
          if (!modal.id) return;
          if (!trimmed) {
            return "Folder name cannot be empty.";
          }
          if (isFolderNameTaken(trimmed, folders, modal.id)) {
            return `A folder named "${trimmed}" already exists.`;
          }
          await renameFolder(modal.id, trimmed);
          break;
        }
        case "rename-drawing": {
          if (!modal.id) return;
          if (!trimmed) {
            return "Drawing name cannot be empty.";
          }
          const current = drawings.find((d) => d.id === modal.id);
          const folderId = current?.folderId ?? null;
          if (isDrawingNameTaken(trimmed, folderId, drawings, modal.id)) {
            return `A drawing named "${trimmed}" already exists in ${folderId ? "this folder" : "root"}.`;
          }
          await renameDrawing(modal.id, trimmed);
          break;
        }
        case "move-drawing": {
          if (!modal.id) return;
          const targetFolderId = value ? value : null;
          const current = drawings.find((d) => d.id === modal.id);
          if (!current) return;
          if (current.folderId === targetFolderId) {
            setModal(null);
            return;
          }
          if (isDrawingNameTaken(current.name, targetFolderId, drawings, modal.id)) {
            const folderName = targetFolderId ? folders.find((f) => f.id === targetFolderId)?.name || "the folder" : "root";
            return `A drawing named "${current.name}" already exists in ${folderName}.`;
          }
          await moveDrawing(modal.id, targetFolderId);
          break;
        }
      }
      setModal(null);
      await reload();
    } catch (err) {
      if (err instanceof Error) {
        return err.message;
      }
      return "An unexpected error occurred.";
    }
  };

  // ─── Inline rename with duplicate prevention ────────────────────────────

  const startInlineRename = (e: React.MouseEvent, id: string, currentName: string) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const commitInlineRename = async (kind: "folder" | "drawing") => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    const trimmed = renameValue.trim();
    if (kind === "folder") {
      if (isFolderNameTaken(trimmed, folders, renamingId)) {
        setToast(`A folder named "${trimmed}" already exists.`);
        setRenamingId(null);
        return;
      }
      try {
        await renameFolder(renamingId, trimmed);
      } catch (err) {
        setToast(err instanceof Error ? err.message : "Rename failed");
      }
    } else {
      const current = drawings.find((d) => d.id === renamingId);
      const folderId = current?.folderId ?? null;
      if (isDrawingNameTaken(trimmed, folderId, drawings, renamingId)) {
        setToast(`A drawing named "${trimmed}" already exists in ${folderId ? "this folder" : "root"}.`);
        setRenamingId(null);
        return;
      }
      try {
        await renameDrawing(renamingId, trimmed);
      } catch (err) {
        setToast(err instanceof Error ? err.message : "Rename failed");
      }
    }
    setRenamingId(null);
    reload();
  };

  // ─── Filtering ──────────────────────────────────────────────────────────

  const q = search.toLowerCase().trim();
  const filteredDrawings = q
    ? drawings.filter((d) => d.name.toLowerCase().includes(q))
    : drawings;
  const filteredFolders = q
    ? folders.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          drawings.some((d) => d.folderId === f.id && d.name.toLowerCase().includes(q))
      )
    : folders;

  const rootDrawings = filteredDrawings.filter((d) => d.folderId === null);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Collapse toggle button (always visible) */}
      <button
        className={`sidebar-toggle${collapsed ? " collapsed" : ""}`}
        onClick={onToggleCollapse}
        title={collapsed ? "Show sidebar" : "Hide sidebar"}
        style={{ left: collapsed ? 0 : 270 }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          {collapsed ? (
            <polyline points="9 18 15 12 9 6" />
          ) : (
            <polyline points="15 18 9 12 15 6" />
          )}
        </svg>
      </button>

      <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
        {/* Header */}
        <div className="sidebar-header">
          <span className="sidebar-title">Drawings</span>
          <div className="sidebar-header-actions">
            {onToggleTheme && (
              <button
                className="icon-btn"
                onClick={onToggleTheme}
                title={theme === "dark" ? "Switch to white/light theme" : "Switch to dark theme"}
              >
                {theme === "dark" ? <IconSun /> : <IconMoon />}
              </button>
            )}
            <button className="icon-btn" onClick={handleNewFolder} title="New folder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
            </button>
            <button className="icon-btn" onClick={() => handleNewDrawing(null)} title="New drawing">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
                <line x1="12" y1="13" x2="12" y2="19" />
                <line x1="9" y1="16" x2="15" y2="16" />
              </svg>
            </button>
            <button className="icon-btn" onClick={onToggleCollapse} title="Collapse sidebar">
              <IconPanelLeft />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="sidebar-search">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search drawings…"
          />
        </div>

        {/* Tree */}
        <div className="sidebar-tree">
          {filteredFolders.length === 0 && rootDrawings.length === 0 ? (
            <div className="sidebar-empty">
              <IconFile />
              <div>No drawings yet.</div>
              <div>Click <strong>+</strong> to create one.</div>
            </div>
          ) : (
            <>
              {/* Folders */}
              {filteredFolders.map((folder) => {
                const isOpen = openFolders.has(folder.id) || !!q;
                const folderDrawings = filteredDrawings.filter((d) => d.folderId === folder.id);
                const isRenaming = renamingId === folder.id;

                return (
                  <div key={folder.id}>
                    <div
                      className={`folder-row`}
                      onClick={() =>
                        setOpenFolders((prev) => {
                          const next = new Set(prev);
                          if (next.has(folder.id)) next.delete(folder.id);
                          else next.add(folder.id);
                          return next;
                        })
                      }
                      onContextMenu={(e) => openCtx(e, "folder", folder.id)}
                    >
                      <span className={`folder-chevron${isOpen ? " open" : ""}`}>
                        <IconChevronRight />
                      </span>
                      <span className="folder-icon">
                        <IconFolder open={isOpen} />
                      </span>

                      {isRenaming ? (
                        <input
                          className="inline-input"
                          value={renameValue}
                          autoFocus
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => commitInlineRename("folder")}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitInlineRename("folder");
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="folder-name">{folder.name}</span>
                      )}

                      {!isRenaming && (
                        <span className="folder-count">{folderDrawings.length}</span>
                      )}

                      <span className="folder-actions">
                        <button
                          className="icon-btn"
                          title="New drawing in folder"
                          onClick={(e) => { e.stopPropagation(); handleNewDrawing(folder.id); }}
                        >
                          <IconPlus />
                        </button>
                        <button
                          className="icon-btn"
                          title="Rename folder"
                          onClick={(e) => startInlineRename(e, folder.id, folder.name)}
                        >
                          <IconEdit />
                        </button>
                        <button
                          className="icon-btn"
                          title="More options"
                          onClick={(e) => openCtx(e, "folder", folder.id)}
                        >
                          <IconDots />
                        </button>
                      </span>
                    </div>

                    {isOpen && (
                      <div className="folder-children">
                        {folderDrawings.map((drawing) => (
                          <DrawingRow
                            key={drawing.id}
                            drawing={drawing}
                            active={drawing.id === activeDrawingId}
                            renamingId={renamingId}
                            renameValue={renameValue}
                            setRenameValue={setRenameValue}
                            onSelect={() => onSelectDrawing(drawing)}
                            onCtx={(e) => openCtx(e, "drawing", drawing.id)}
                            onRename={(e) => startInlineRename(e, drawing.id, drawing.name)}
                            onCommitRename={() => commitInlineRename("drawing")}
                            onCancelRename={() => setRenamingId(null)}
                          />
                        ))}
                        {folderDrawings.length === 0 && (
                          <div className="folder-empty">
                            Empty folder
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Root-level drawings (no folder) */}
              {rootDrawings.length > 0 && (
                <>
                  {filteredFolders.length > 0 && (
                    <div className="sidebar-divider" />
                  )}
                  {rootDrawings.map((drawing) => (
                    <DrawingRow
                      key={drawing.id}
                      drawing={drawing}
                      active={drawing.id === activeDrawingId}
                      renamingId={renamingId}
                      renameValue={renameValue}
                      setRenameValue={setRenameValue}
                      onSelect={() => onSelectDrawing(drawing)}
                      onCtx={(e) => openCtx(e, "drawing", drawing.id)}
                      onRename={(e) => startInlineRename(e, drawing.id, drawing.name)}
                      onCommitRename={() => commitInlineRename("drawing")}
                      onCancelRename={() => setRenamingId(null)}
                      rootLevel
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Status bar */}
        <div className="sidebar-status">
          <div className="status-left">
            <span className={`status-dot${saving ? " saving" : ""}`} />
            <span>{saving ? "Saving…" : "All changes saved"}</span>
          </div>
          <span className="status-badge">IndexedDB</span>
        </div>
      </aside>

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          folders={folders}
          onClose={() => setCtxMenu(null)}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onNewDrawingInFolder={(fid) => handleNewDrawing(fid)}
          onRenameDrawing={handleRenameDrawing}
          onMoveDrawing={handleMoveDrawing}
          onDeleteDrawing={handleDeleteDrawing}
        />
      )}

      {/* Modal */}
      {modal && (
        <Modal
          modal={modal}
          folders={folders}
          onClose={() => setModal(null)}
          onSubmit={handleModalSubmit}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="sidebar-toast" onClick={() => setToast(null)}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{toast}</span>
        </div>
      )}
    </>
  );
}

// ─── DrawingRow sub-component ─────────────────────────────────────────────────

function DrawingRow({
  drawing,
  active,
  renamingId,
  renameValue,
  setRenameValue,
  onSelect,
  onCtx,
  onRename,
  onCommitRename,
  onCancelRename,
  rootLevel = false,
}: {
  drawing: Drawing;
  active: boolean;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onSelect: () => void;
  onCtx: (e: React.MouseEvent) => void;
  onRename: (e: React.MouseEvent) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  rootLevel?: boolean;
}) {
  const isRenaming = renamingId === drawing.id;

  return (
    <div
      className={`drawing-row${active ? " active" : ""}${rootLevel ? " root-level" : ""}`}
      onClick={onSelect}
      onContextMenu={onCtx}
    >
      <span className="drawing-icon">
        <IconFile />
      </span>

      {isRenaming ? (
        <input
          className="inline-input"
          value={renameValue}
          autoFocus
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename();
            if (e.key === "Escape") onCancelRename();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="drawing-name">{drawing.name}</span>
      )}

      {!isRenaming && (
        <>
          <span className="drawing-date">{formatDate(drawing.updatedAt)}</span>
          <span className="drawing-actions">
            <button className="icon-btn" title="Rename" onClick={onRename}>
              <IconEdit />
            </button>
            <button className="icon-btn" title="More options" onClick={onCtx}>
              <IconDots />
            </button>
          </span>
        </>
      )}
    </div>
  );
}
