import React, { useState, useEffect, useRef, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";

// ── Helper: Read Real Auth State from localStorage ────────────────────────────
function getStoredAuth() {
  try {
    const token = localStorage.getItem("token");
    const rawUser = localStorage.getItem("user");
    if (!token || !rawUser) return null;

    const parsedUser = JSON.parse(rawUser);
    if (!parsedUser || typeof parsedUser !== "object") return null;

    return {
      token,
      user: parsedUser,
    };
  } catch {
    return null;
  }
}

// ── Helper: Read & Save Local Dashboard Preferences ──────────────────────────
const PREFS_STORAGE_KEY = "docflow_dashboard_prefs_v1";

const DEFAULT_PREFS = {
  theme: "light",
  defaultSection: "dashboard",
  compactCards: false,
  confirmBeforeClearFile: false,
  showValidationAlerts: true,
  showActivityToasts: true,
};

function getStoredPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...(parsed && typeof parsed === "object" ? parsed : {}) };
  } catch {
    return DEFAULT_PREFS;
  }
}

// ── Helper: Format File Size ──────────────────────────────────────────────────
function formatFileSize(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, idx);
  return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

// ── Helper: Format Real Timestamp ─────────────────────────────────────────────
function formatTimestamp(isoOrMs) {
  if (!isoOrMs) return "Unknown time";
  try {
    const date = new Date(isoOrMs);
    if (Number.isNaN(date.getTime())) return "Unknown time";
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Unknown time";
  }
}

// ── Helper: Validate File for a Specific Feature Card ─────────────────────────
function validateFilesForTool(fileList, tool) {
  const files = Array.from(fileList || []);
  if (files.length === 0) {
    return { valid: false, error: "No file selected.", files: [] };
  }

  const allowedExtensions = tool.acceptExtensions || [".pdf"];
  const invalidFiles = files.filter((file) => {
    const lowerName = (file.name || "").toLowerCase();
    return !allowedExtensions.some((ext) => lowerName.endsWith(ext.toLowerCase()));
  });

  if (invalidFiles.length > 0) {
    const invalidNames = invalidFiles.map((f) => `"${f.name}"`).join(", ");
    return {
      valid: false,
      error: `Unsupported file format (${invalidNames}). ${tool.title} accepts ${allowedExtensions.join(", ").toUpperCase()} files only.`,
      files: [],
    };
  }

  return { valid: true, error: null, files };
}

// ── Brand Logo Icon ───────────────────────────────────────────────────────────
function BrandLogoIcon() {
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-600 shadow-xs shrink-0">
      <svg
        className="w-4 h-4 text-white"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    </div>
  );
}

// ── Compact Violet Upload Icon SVG ────────────────────────────────────────────
function UploadSvgIcon({ className = "w-3.5 h-3.5" }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
      />
    </svg>
  );
}

// ── Sidebar Navigation Items ──────────────────────────────────────────────────
const SIDEBAR_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "grid" },
  { id: "my-documents", label: "My Documents", icon: "folder" },
  { id: "recent-files", label: "Recent Files", icon: "clock" },
  { id: "all-tools", label: "All Tools", icon: "tools" },
  { id: "ai-analysis", label: "AI Document Analysis", icon: "sparkles" },
  { id: "settings", label: "Settings", icon: "settings" },
];

// ── Categorized Workspace Tools (Cleaned & Mapped to Real Workspaces) ─────────
const TOOL_CATEGORIES = [
  {
    id: "organize-pdf",
    title: "Organize PDF",
    description: "Combine, separate, optimize, or adjust page orientation.",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200/80",
    iconBg: "bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white",
    tools: [
      {
        id: "merge-pdf",
        title: "Merge PDF",
        description: "Combine multiple PDF files into one organized document in any order.",
        icon: "merge",
        accept: ".pdf,application/pdf",
        acceptExtensions: [".pdf"],
        allowMultiple: true,
        uploadLabel: "Upload PDFs",
        workspaceRoute: "/workspace/merge-pdf",
      },
      {
        id: "split-pdf",
        title: "Split PDF",
        description: "Extract specific pages or separate a PDF into multiple smaller files.",
        icon: "split",
        accept: ".pdf,application/pdf",
        acceptExtensions: [".pdf"],
        allowMultiple: false,
        uploadLabel: "Upload PDF",
        workspaceRoute: "/workspace/split-pdf",
      },
      {
        id: "compress-pdf",
        title: "Compress PDF",
        description: "Reduce PDF file size while preserving crisp text and visual quality.",
        icon: "compress",
        accept: ".pdf,application/pdf",
        acceptExtensions: [".pdf"],
        allowMultiple: false,
        uploadLabel: "Upload PDF",
        workspaceRoute: "/workspace/compress-pdf",
      },
      {
        id: "rotate-pdf",
        title: "Rotate PDF",
        description: "Rotate individual pages or entire PDF documents 90°, 180°, or 270°.",
        icon: "rotate",
        accept: ".pdf,application/pdf",
        acceptExtensions: [".pdf"],
        allowMultiple: false,
        uploadLabel: "Upload PDF",
        workspaceRoute: "/workspace/rotate-pdf",
      },
    ],
  },
  {
    id: "edit-pdf",
    title: "Edit PDF",
    description: "Annotate, watermark, and sign documents with precision.",
    badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
    iconBg: "bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white",
    tools: [
      {
        id: "edit-pdf",
        title: "Edit PDF",
        description: "Add text, shapes, highlights, and freehand annotations directly onto PDF pages.",
        icon: "edit",
        accept: ".pdf,application/pdf",
        acceptExtensions: [".pdf"],
        allowMultiple: false,
        uploadLabel: "Upload PDF",
        workspaceRoute: "/workspace/edit-pdf",
      },
      {
        id: "watermark-pdf",
        title: "Watermark PDF",
        description: "Stamp custom text or image watermarks with adjustable opacity and position.",
        icon: "watermark",
        accept: ".pdf,application/pdf",
        acceptExtensions: [".pdf"],
        allowMultiple: false,
        uploadLabel: "Upload PDF",
        workspaceRoute: "/workspace/watermark-pdf",
      },
      {
        id: "sign-pdf",
        title: "Sign PDF",
        description: "Draw, type, or upload your electronic signature to sign documents securely.",
        icon: "sign",
        accept: ".pdf,application/pdf",
        acceptExtensions: [".pdf"],
        allowMultiple: false,
        uploadLabel: "Upload PDF",
        workspaceRoute: "/workspace/sign-pdf",
      },
    ],
  },
  {
    id: "convert-files",
    title: "Convert Files",
    description: "Transform documents between PDF, Word, Excel, PowerPoint, and images.",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    iconBg: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white",
    tools: [
      {
        id: "pdf-to-word",
        title: "PDF to Word",
        description: "Convert PDF documents into editable DOCX files with accurate layout retention.",
        icon: "word",
        accept: ".pdf,application/pdf",
        acceptExtensions: [".pdf"],
        allowMultiple: false,
        uploadLabel: "Upload PDF",
        workspaceRoute: "/workspace/pdf-to-word",
      },
      {
        id: "word-to-pdf",
        title: "Word to PDF",
        description: "Turn DOC and DOCX documents into standardized, print-ready PDF files.",
        icon: "doc-pdf",
        accept:
          ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        acceptExtensions: [".doc", ".docx"],
        allowMultiple: false,
        uploadLabel: "Upload Word",
        workspaceRoute: "/workspace/word-to-pdf",
      },
      {
        id: "pdf-to-jpg",
        title: "PDF to JPG",
        description: "Export each PDF page as a high-resolution JPG image or extract embedded photos.",
        icon: "image",
        accept: ".pdf,application/pdf",
        acceptExtensions: [".pdf"],
        allowMultiple: false,
        uploadLabel: "Upload PDF",
        workspaceRoute: "/workspace/pdf-to-jpg",
      },
      {
        id: "pdf-to-excel",
        title: "PDF to Excel",
        description: "Extract tables and structured numerical data from PDFs into XLSX spreadsheets.",
        icon: "excel",
        accept: ".pdf,application/pdf",
        acceptExtensions: [".pdf"],
        allowMultiple: false,
        uploadLabel: "Upload PDF",
        workspaceRoute: "/workspace/pdf-to-excel",
      },
      {
        id: "pdf-to-ppt",
        title: "PDF to PowerPoint",
        description: "Convert PDF presentation decks into editable PPTX slide presentations.",
        icon: "ppt",
        accept: ".pdf,application/pdf",
        acceptExtensions: [".pdf"],
        allowMultiple: false,
        uploadLabel: "Upload PDF",
        workspaceRoute: "/workspace/pdf-to-ppt",
      },
    ],
  },
  {
    id: "ai-tools",
    title: "AI Tools",
    description: "Analyze, summarize, and query complex documents with AI assistance.",
    badgeColor: "bg-violet-50 text-violet-700 border-violet-200/80",
    iconBg: "bg-violet-50 text-violet-600 group-hover:bg-violet-600 group-hover:text-white",
    tools: [
      {
        id: "ai-document-analysis",
        title: "AI Document Analysis",
        description: "Generate executive summaries, key takeaways, and structured insights from any PDF.",
        icon: "sparkles",
        accept: ".pdf,application/pdf",
        acceptExtensions: [".pdf"],
        allowMultiple: false,
        uploadLabel: "Upload PDF",
        workspaceRoute: "/workspace/ai-analysis",
      },
    ],
  },
  {
    id: "document-management",
    title: "Document Management",
    description: "View, create, and organize your personal document workspace.",
    badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
    iconBg: "bg-slate-100 text-slate-700 group-hover:bg-slate-800 group-hover:text-white",
    tools: [
      {
        id: "document-viewer",
        title: "Document Viewer",
        description: "Open and inspect PDF documents with zoom, page navigation, and text search.",
        icon: "eye",
        accept: ".pdf,application/pdf",
        acceptExtensions: [".pdf"],
        allowMultiple: false,
        uploadLabel: "Upload PDF",
        workspaceRoute: "/workspace/view-pdf",
      },
      {
        id: "create-document",
        title: "Create Document",
        description: "Start a new structured document or import an existing draft into the editor.",
        icon: "plus-doc",
        accept: ".pdf,.doc,.docx,.txt",
        acceptExtensions: [".pdf", ".doc", ".docx", ".txt"],
        allowMultiple: false,
        uploadLabel: "Import File",
        workspaceRoute: "/workspace/create-document",
      },
    ],
  },
];

// ── SVG Icon Renderer ─────────────────────────────────────────────────────────
function ToolIcon({ type, className = "w-5 h-5" }) {
  switch (type) {
    case "grid":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      );
    case "folder":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      );
    case "clock":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "tools":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      );
    case "sparkles":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
        </svg>
      );
    case "settings":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "merge":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
        </svg>
      );
    case "split":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      );
    case "compress":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 14h6m0 0v6m0-6l-7 7m17-11h-6m0 0V4m0 6l7-7" />
        </svg>
      );
    case "rotate":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      );
    case "edit":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
    case "watermark":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    case "sign":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      );
    case "word":
    case "doc-pdf":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "image":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "excel":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case "ppt":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
      );
    case "eye":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      );
    case "plus-doc":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Dashboard() {
  const navigate = useNavigate();

  // ── Preferences State (Saved in localStorage) ───────────────────────────────
  const [prefs, setPrefs] = useState(() => getStoredPrefs());

  // ── Real Auth State ─────────────────────────────────────────────────────────
  const [auth, setAuth] = useState(() => getStoredAuth());
  const [activeSection, setActiveSection] = useState(() => {
    const initialPrefs = getStoredPrefs();
    return initialPrefs.defaultSection || "dashboard";
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedToolNotice, setSelectedToolNotice] = useState(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [confirmLogoutModal, setConfirmLogoutModal] = useState(false);

  // ── Feature Card File Selections & Validation Errors ────────────────────────
  const [cardFilesByTool, setCardFilesByTool] = useState({});
  const [cardErrorsByTool, setCardErrorsByTool] = useState({});

  // ── Storage Keys Scoped to the Authenticated User ────────────────────────────
  const userStorageKey = useMemo(() => {
    return auth?.user?.id || auth?.user?.email || "guest";
  }, [auth]);

  // ── Persistent User Activity & Recent Files ──────────────────────────────────
  const [recentFiles, setRecentFiles] = useState(() => {
    try {
      const stored = localStorage.getItem(`docflow_recent_files_${userStorageKey}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [recentActivity, setRecentActivity] = useState(() => {
    try {
      const stored = localStorage.getItem(`docflow_recent_activity_${userStorageKey}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // ── Persistent My Documents (Reads Created Documents & Drafts) ───────────────
  const [myDocuments, setMyDocuments] = useState(() => {
    const docs = [];
    try {
      // 1. Check for genuine drafts from the CreateDocument editor
      const draft = localStorage.getItem("ai_doc_workspace_draft_v1");
      if (draft) {
        const parsedDraft = JSON.parse(draft);
        if (parsedDraft?.content && parsedDraft.content.trim()) {
          docs.push({
            id: "draft-create-doc-1",
            name: parsedDraft.title || "Untitled Document",
            type: "Document Draft",
            extension: ".docx",
            size: new Blob([parsedDraft.content]).size,
            savedAt: parsedDraft.savedAt || new Date().toISOString(),
            sourceTool: "Create Document",
            workspaceRoute: "/workspace/create-document",
            status: "Saved Draft",
          });
        }
      }
      // 2. Check for retained user documents
      const savedDocs = localStorage.getItem(`docflow_my_docs_${userStorageKey}`);
      if (savedDocs) {
        const parsed = JSON.parse(savedDocs);
        if (Array.isArray(parsed)) {
          docs.push(...parsed);
        }
      }
    } catch {}
    return docs;
  });

  // ── Filters for Recent Files Section ────────────────────────────────────────
  const [recentSearchQuery, setRecentSearchQuery] = useState("");
  const [recentTypeFilter, setRecentTypeFilter] = useState("all");

  const profileMenuRef = useRef(null);
  const quickUploadInputRef = useRef(null);
  const toolFileInputRefs = useRef({});

  // Sync auth state with localStorage
  useEffect(() => {
    const syncAuth = () => {
      const current = getStoredAuth();
      setAuth(current);
    };
    window.addEventListener("storage", syncAuth);
    return () => window.removeEventListener("storage", syncAuth);
  }, []);

  // Save recent files per authenticated user
  useEffect(() => {
    try {
      localStorage.setItem(
        `docflow_recent_files_${userStorageKey}`,
        JSON.stringify(recentFiles.slice(0, 50))
      );
    } catch {}
  }, [recentFiles, userStorageKey]);

  // Save recent activity per authenticated user
  useEffect(() => {
    try {
      localStorage.setItem(
        `docflow_recent_activity_${userStorageKey}`,
        JSON.stringify(recentActivity.slice(0, 50))
      );
    } catch {}
  }, [recentActivity, userStorageKey]);

  // Refresh My Documents list when opening the section
  useEffect(() => {
    if (activeSection === "my-documents") {
      const docs = [];
      try {
        const draft = localStorage.getItem("ai_doc_workspace_draft_v1");
        if (draft) {
          const parsedDraft = JSON.parse(draft);
          if (parsedDraft?.content && parsedDraft.content.trim()) {
            docs.push({
              id: "draft-create-doc-1",
              name: parsedDraft.title || "Untitled Document",
              type: "Document Draft",
              extension: ".docx",
              size: new Blob([parsedDraft.content]).size,
              savedAt: parsedDraft.savedAt || new Date().toISOString(),
              sourceTool: "Create Document",
              workspaceRoute: "/workspace/create-document",
              status: "Saved Draft",
            });
          }
        }
        const savedDocs = localStorage.getItem(`docflow_my_docs_${userStorageKey}`);
        if (savedDocs) {
          const parsed = JSON.parse(savedDocs);
          if (Array.isArray(parsed)) {
            docs.push(...parsed);
          }
        }
      } catch {}
      setMyDocuments(docs);
    }
  }, [activeSection, userStorageKey]);

  // Save preferences to localStorage whenever updated
  const updatePreference = (key, value, labelForActivity) => {
    setPrefs((prev) => {
      const updated = { ...prev, [key]: value };
      try {
        localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (labelForActivity) {
      recordActivity("setting_updated", labelForActivity);
    }
  };

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [profileMenuOpen]);

  // Close mobile sidebar on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setMobileSidebarOpen(false);
        setProfileMenuOpen(false);
        setConfirmLogoutModal(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Helper: Record Real User Activity ───────────────────────────────────────
  const recordActivity = (type, detail, meta = {}) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      detail,
      timestamp: new Date().toISOString(),
      ...meta,
    };
    setRecentActivity((prev) => [entry, ...prev.slice(0, 49)]);
  };

  // ── Logout Handler ──────────────────────────────────────────────────────────
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setAuth(null);
    setProfileMenuOpen(false);
    setConfirmLogoutModal(false);
    navigate("/");
  };

  // ── Quick Action "Upload Document" Handler (Top Banner) ─────────────────────
  const handleQuickUploadChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const file = files[0];
    const nowIso = new Date().toISOString();
    const ext = file.name.includes(".")
      ? `.${file.name.split(".").pop().toLowerCase()}`
      : "";

    const newFileEntry = {
      id: `${Date.now()}-${file.name}`,
      name: file.name,
      size: file.size,
      type: file.type || ext.replace(".", "").toUpperCase() || "Document",
      extension: ext,
      lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : nowIso,
      selectedAt: nowIso,
      toolId: "document-viewer",
      toolTitle: "Quick Upload",
      workspaceRoute: "/workspace/view-pdf",
      status: "Ready for Viewer",
      rawFile: file,
    };

    setRecentFiles((prev) => [newFileEntry, ...prev]);
    recordActivity(
      "file_selected",
      `Selected "${file.name}" (${formatFileSize(file.size)}) via Quick Upload`,
      { fileName: file.name, toolTitle: "Document Viewer" }
    );

    // Navigate directly into Document Viewer with the staged file
    navigate("/workspace/view-pdf", {
      state: {
        initialFiles: [file],
      },
    });

    e.target.value = "";
  };

  // ── Per-Card Violet Upload Button File Handler ──────────────────────────────
  const handleCardFileChange = (tool, event) => {
    event.stopPropagation();
    const rawList = event.target.files;
    if (!rawList || rawList.length === 0) return;

    const validation = validateFilesForTool(rawList, tool);

    if (!validation.valid) {
      setCardErrorsByTool((prev) => ({
        ...prev,
        [tool.id]: validation.error,
      }));

      recordActivity("validation_error", `Rejected unsupported file for ${tool.title}`, {
        toolTitle: tool.title,
      });

      if (prefs.showValidationAlerts) {
        setSelectedToolNotice({
          title: `Unsupported File for ${tool.title}`,
          message: validation.error,
          isError: true,
        });
      }

      event.target.value = "";
      return;
    }

    setCardErrorsByTool((prev) => {
      const next = { ...prev };
      delete next[tool.id];
      return next;
    });

    const validFiles = validation.files;
    const nowIso = new Date().toISOString();

    setCardFilesByTool((prev) => ({
      ...prev,
      [tool.id]: {
        files: validFiles,
        selectedAt: nowIso,
        toolTitle: tool.title,
        workspaceRoute: tool.workspaceRoute,
      },
    }));

    const newRecentEntries = validFiles.map((file, idx) => {
      const ext = file.name.includes(".")
        ? `.${file.name.split(".").pop().toLowerCase()}`
        : "";
      return {
        id: `${Date.now()}-${idx}-${file.name}`,
        name: file.name,
        size: file.size,
        type: file.type || ext.replace(".", "").toUpperCase() || "Document",
        extension: ext,
        lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : nowIso,
        selectedAt: nowIso,
        toolId: tool.id,
        toolTitle: tool.title,
        workspaceRoute: tool.workspaceRoute,
        status: "Staged for workspace",
        rawFile: file,
      };
    });

    setRecentFiles((prev) => [...newRecentEntries, ...prev]);

    const fileSummary =
      validFiles.length === 1
        ? `"${validFiles[0].name}" (${formatFileSize(validFiles[0].size)})`
        : `${validFiles.length} files (${validFiles.map((f) => f.name).join(", ")})`;

    recordActivity("file_selected", `Selected ${fileSummary} for ${tool.title}`, {
      toolTitle: tool.title,
      fileName: validFiles[0].name,
    });

    if (prefs.showActivityToasts) {
      setSelectedToolNotice({
        title: `${tool.title} — Ready`,
        message: `Selected ${fileSummary}. Click the card to launch the ${tool.title} workspace.`,
        route: tool.workspaceRoute,
        isError: false,
      });
    }

    event.target.value = "";
  };

  // ── Clear Selected File(s) from a Feature Card ──────────────────────────────
  const handleClearCardFile = (tool, event) => {
    event.stopPropagation();
    const existing = cardFilesByTool[tool.id];
    if (!existing) return;

    if (
      prefs.confirmBeforeClearFile &&
      !window.confirm(`Remove selected file(s) from ${tool.title}?`)
    ) {
      return;
    }

    setCardFilesByTool((prev) => {
      const next = { ...prev };
      delete next[tool.id];
      return next;
    });

    setCardErrorsByTool((prev) => {
      const next = { ...prev };
      delete next[tool.id];
      return next;
    });

    recordActivity("file_cleared", `Cleared selected file(s) from ${tool.title}`, {
      toolTitle: tool.title,
    });
  };

  // ── Trigger Hidden File Input for a Card ────────────────────────────────────
  const triggerCardUpload = (toolId, event) => {
    event.stopPropagation();
    const inputEl = toolFileInputRefs.current[toolId];
    if (inputEl) {
      inputEl.click();
    }
  };

  // ── Tool Card Click Handler (Navigates to Connected Workspace) ──────────────
  const handleToolSelect = (tool) => {
    if (tool.targetSection) {
      setActiveSection(tool.targetSection);
      setSelectedToolNotice(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const attachedSelection = cardFilesByTool[tool.id];
    const hasFiles = attachedSelection && attachedSelection.files.length > 0;

    if (tool.workspaceRoute) {
      recordActivity(
        "workspace_opened",
        hasFiles
          ? `Navigated to ${tool.title} with ${attachedSelection.files.length} selected file(s)`
          : `Opened ${tool.title} workspace`,
        { toolTitle: tool.title }
      );

      navigate(tool.workspaceRoute, {
        state: {
          initialFiles: hasFiles ? attachedSelection.files : [],
        },
      });
    }
  };

  // ── Common Search Input Handler ─────────────────────────────────────────────
  const handleSearchInputChange = (e) => {
    setSearchQuery(e.target.value);
    if (
      activeSection !== "dashboard" &&
      activeSection !== "all-tools" &&
      activeSection !== "ai-analysis"
    ) {
      setActiveSection("all-tools");
    }
  };

  // ── Filtered Categories based on Search Query & Active Sidebar Section ──────
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return TOOL_CATEGORIES.filter((cat) => {
      if (activeSection === "ai-analysis") {
        return cat.id === "ai-tools";
      }
      return true;
    })
      .map((cat) => {
        if (!q) return cat;
        const matchedTools = cat.tools.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            cat.title.toLowerCase().includes(q)
        );
        return { ...cat, tools: matchedTools };
      })
      .filter((cat) => cat.tools.length > 0);
  }, [searchQuery, activeSection]);

  // ── Filtered Recent Files ───────────────────────────────────────────────────
  const filteredRecentFiles = useMemo(() => {
    const q = recentSearchQuery.trim().toLowerCase();
    return recentFiles.filter((item) => {
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.toolTitle.toLowerCase().includes(q);

      if (!matchesQuery) return false;

      if (recentTypeFilter === "all") return true;
      if (recentTypeFilter === "pdf") {
        return item.extension === ".pdf" || item.type.toLowerCase().includes("pdf");
      }
      if (recentTypeFilter === "word") {
        return (
          item.extension === ".doc" ||
          item.extension === ".docx" ||
          item.type.toLowerCase().includes("word")
        );
      }
      return (
        item.extension !== ".pdf" &&
        item.extension !== ".doc" &&
        item.extension !== ".docx"
      );
    });
  }, [recentFiles, recentSearchQuery, recentTypeFilter]);

  // ── Total Session Selected Storage Stats ────────────────────────────────────
  const sessionStorageStats = useMemo(() => {
    const totalBytes = recentFiles.reduce((acc, item) => acc + (item.size || 0), 0);
    const activeCardCount = Object.keys(cardFilesByTool).length;
    return {
      totalFilesSelected: recentFiles.length,
      totalBytes,
      formattedSize: formatFileSize(totalBytes),
      activeCardCount,
    };
  }, [recentFiles, cardFilesByTool]);

  // ── Unauthenticated Fallback State ──────────────────────────────────────────
  if (!auth) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex flex-col justify-center items-center px-4 sm:px-6 py-12 overflow-x-hidden">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 sm:p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Sign in required
          </h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Please log in to your AI Document Workspace account to access your dashboard and document tools.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/"
              className="w-full sm:w-auto min-h-[42px] inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-xs transition-all"
            >
              Return to Homepage
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Real User Details ───────────────────────────────────────────────────────
  const userName =
    typeof auth.user.name === "string" && auth.user.name.trim()
      ? auth.user.name.trim()
      : "";
  const userEmail =
    typeof auth.user.email === "string" && auth.user.email.trim()
      ? auth.user.email.trim()
      : "";
  const displayName = userName || userEmail || "Workspace User";
  const avatarInitial = displayName.charAt(0).toUpperCase();

  // ── Feature Card Component with Compact Violet SVG Upload Button ────────────
  const renderToolCard = (tool, category) => {
    const cardSelection = cardFilesByTool[tool.id];
    const cardError = cardErrorsByTool[tool.id];
    const hasSelectedFiles = cardSelection && cardSelection.files.length > 0;

    return (
      <div
        key={tool.id}
        onClick={() => handleToolSelect(tool)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleToolSelect(tool);
          }
        }}
        className={`group text-left bg-white hover:bg-slate-50/70 rounded-2xl border ${
          hasSelectedFiles
            ? "border-violet-300 ring-1 ring-violet-500/20"
            : "border-slate-200/90 hover:border-blue-300/90"
        } ${
          prefs.compactCards ? "p-3.5 sm:p-4" : "p-4 sm:p-5"
        } shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[168px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600`}
      >
        <input
          ref={(el) => {
            toolFileInputRefs.current[tool.id] = el;
          }}
          type="file"
          accept={tool.accept || ".pdf,application/pdf"}
          multiple={Boolean(tool.allowMultiple)}
          onChange={(e) => handleCardFileChange(tool, e)}
          onClick={(e) => e.stopPropagation()}
          className="hidden"
          aria-label={`${tool.uploadLabel || "Upload"} for ${tool.title}`}
        />

        <div>
          <div className="flex items-start justify-between gap-2 mb-3.5 flex-wrap">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-200 shrink-0 ${category.iconBg}`}
            >
              <ToolIcon type={tool.icon} className="w-5 h-5" />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={(e) => triggerCardUpload(tool.id, e)}
                title={`Select ${tool.acceptExtensions?.join(", ") || ".pdf"} file for ${tool.title}`}
                className="min-h-[36px] sm:min-h-[34px] px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs hover:shadow-xs transition-all cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1"
              >
                <UploadSvgIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{tool.uploadLabel || "Upload"}</span>
              </button>
            </div>
          </div>

          <h4 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
            {tool.title}
          </h4>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed line-clamp-2">
            {tool.description}
          </p>
        </div>

        <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex flex-col gap-2">
          {cardError && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg bg-red-50 border border-red-200/90 px-2.5 py-2 text-[11px] text-red-700 flex items-start justify-between gap-2"
            >
              <span className="leading-snug break-words">{cardError}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCardErrorsByTool((prev) => {
                    const next = { ...prev };
                    delete next[tool.id];
                    return next;
                  });
                }}
                className="text-red-500 hover:text-red-700 font-bold shrink-0 px-1"
                aria-label="Dismiss validation error"
              >
                ×
              </button>
            </div>
          )}

          {hasSelectedFiles && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg bg-violet-50/90 border border-violet-200/90 px-2.5 py-1.5 flex items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-violet-900 truncate">
                  {cardSelection.files.length === 1
                    ? cardSelection.files[0].name
                    : `${cardSelection.files.length} files selected`}
                </p>
                <p className="text-[10px] text-violet-700 truncate">
                  {formatFileSize(
                    cardSelection.files.reduce((sum, f) => sum + (f.size || 0), 0)
                  )}{" "}
                  • Ready for workspace
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => handleClearCardFile(tool, e)}
                title="Remove selected file"
                className="min-h-[28px] min-w-[28px] rounded-md text-violet-700 hover:text-red-600 hover:bg-white/80 inline-flex items-center justify-center text-xs font-bold transition-colors shrink-0"
                aria-label={`Clear selected file for ${tool.title}`}
              >
                ×
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500 group-hover:text-blue-600 transition-colors">
            <span className="truncate">
              {hasSelectedFiles
                ? `Open ${tool.title} with selected file(s)`
                : `Open ${tool.title} workspace`}
            </span>
            <svg
              className="w-3.5 h-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 flex overflow-x-hidden">
      <input
        ref={quickUploadInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.txt"
        onChange={handleQuickUploadChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* ── Logout Confirmation Modal ────────────────────────────────────────── */}
      {confirmLogoutModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-confirm-title"
        >
          <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-xl p-5 sm:p-6">
            <h3 id="logout-confirm-title" className="text-base sm:text-lg font-bold text-slate-900">
              Sign out of AI Document Workspace?
            </h3>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-600 leading-relaxed">
              Your current authentication session in this browser will be closed. Any files selected locally during this session are preserved in your local browser history.
            </p>
            <div className="mt-5 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmLogoutModal(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs sm:text-sm font-semibold text-white shadow-xs transition-colors cursor-pointer"
              >
                Confirm Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Sidebar Backdrop ──────────────────────────────────────────── */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Left Sidebar Navigation ──────────────────────────────────────────── */}
      <aside
        aria-label="Workspace navigation"
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200/90 flex flex-col justify-between transition-transform duration-200 ease-out lg:static lg:translate-x-0 lg:shrink-0 ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div>
          <div className="h-16 px-5 flex items-center justify-between border-b border-slate-100">
            <Link
              to="/"
              className="flex items-center gap-2.5 group focus:outline-none"
            >
              <BrandLogoIcon />
              <div className="flex flex-col">
                <span className="text-[15px] font-bold tracking-tight text-slate-900 leading-none">
                  DocFlow{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                    AI
                  </span>
                </span>
                <span className="text-[11px] font-medium text-slate-400 mt-0.5">
                  Document Workspace
                </span>
              </div>
            </Link>

            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="lg:hidden min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              aria-label="Close navigation menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav className="p-3 space-y-1">
            {SIDEBAR_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              const badgeCount =
                item.id === "recent-files" && recentFiles.length > 0
                  ? recentFiles.length
                  : item.id === "my-documents" && myDocuments.length > 0
                  ? myDocuments.length
                  : null;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(item.id);
                    setSelectedToolNotice(null);
                    setMobileSidebarOpen(false);
                  }}
                  className={`w-full min-h-[42px] px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between gap-2 transition-all cursor-pointer ${
                    isActive
                      ? "bg-blue-50/90 text-blue-700 font-semibold shadow-2xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className={isActive ? "text-blue-600" : "text-slate-400"}>
                      <ToolIcon type={item.icon} className="w-5 h-5" />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </span>

                  {badgeCount !== null && (
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-violet-100 text-violet-700 shrink-0">
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-3 border-t border-slate-100 space-y-2">
          <div className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
              {avatarInitial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 truncate">
                {displayName}
              </p>
              {userEmail && (
                <p className="text-[11px] text-slate-500 truncate">{userEmail}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setConfirmLogoutModal(true)}
            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main Workspace Area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Sticky Header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
          <div className="h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
            {/* Left: Mobile Menu Button + Section Title */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="lg:hidden min-h-[40px] min-w-[40px] -ml-1 inline-flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                aria-label="Open navigation menu"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              <h1 className="text-sm sm:text-base md:text-lg font-bold text-slate-900 truncate">
                {SIDEBAR_ITEMS.find((i) => i.id === activeSection)?.label || "Dashboard"}
              </h1>
            </div>

            {/* Right: Desktop Search Bar + User Profile Menu */}
            <div className="flex items-center justify-end gap-2.5 sm:gap-4 flex-1 sm:flex-initial">
              <div className="hidden md:block relative w-64 lg:w-72">
                <svg
                  className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={handleSearchInputChange}
                  placeholder="Search PDF & AI tools..."
                  aria-label="Search PDF and AI tools"
                  className="appearance-none w-full h-10 pl-10 pr-4 rounded-full bg-slate-100/90 hover:bg-slate-100 focus:bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 border border-slate-200/90 hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 shadow-2xs focus:outline-none transition-all truncate"
                />
              </div>

              {/* User Profile Dropdown */}
              <div className="relative shrink-0" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((prev) => !prev)}
                  className="min-h-[40px] flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full border border-slate-200/90 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="true"
                  aria-label="Account menu"
                >
                  <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-xs font-semibold flex items-center justify-center">
                    {avatarInitial}
                  </span>
                  <span className="hidden md:inline text-xs font-semibold text-slate-700 max-w-[120px] truncate">
                    {displayName}
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                      profileMenuOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {profileMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-60 rounded-xl bg-white border border-slate-200/90 shadow-lg py-1.5 z-50"
                  >
                    <div className="px-4 py-2.5 border-b border-slate-100">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {displayName}
                      </p>
                      {userEmail && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {userEmail}
                        </p>
                      )}
                    </div>

                    <div className="py-1">
                      <Link
                        to="/"
                        role="menuitem"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs sm:text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <span>Public Homepage</span>
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setActiveSection("settings");
                          setProfileMenuOpen(false);
                        }}
                        className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-xs sm:text-sm text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <span>Account Settings</span>
                      </button>
                    </div>

                    <div className="border-t border-slate-100 pt-1">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          setConfirmLogoutModal(true);
                        }}
                        className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-xs sm:text-sm font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <span>Logout</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile Search Input Row */}
          <div className="md:hidden px-4 pb-3 sm:px-6 pt-0">
            <div className="relative w-full">
              <svg
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="search"
                value={searchQuery}
                onChange={handleSearchInputChange}
                placeholder="Search PDF & AI tools..."
                aria-label="Search PDF and AI tools"
                className="appearance-none w-full h-10 pl-10 pr-4 rounded-full bg-slate-100/90 hover:bg-slate-100 focus:bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 border border-slate-200/90 hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 shadow-2xs focus:outline-none transition-all"
              />
            </div>
          </div>
        </header>

        {/* ── Main Content Body ──────────────────────────────────────────────── */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
          {/* Welcome Banner + Quick Actions */}
          {activeSection === "dashboard" && (
            <section className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white p-5 sm:p-7 lg:p-8 shadow-sm border border-slate-800/80">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                <div className="space-y-2 max-w-2xl">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/10 text-blue-200 text-xs font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>AI Document Workspace</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-white">
                    Welcome back, {displayName}
                  </h2>
                  {userEmail && (
                    <p className="text-xs sm:text-sm text-slate-300">
                      Signed in as <span className="font-medium text-white">{userEmail}</span>
                    </p>
                  )}
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pt-1">
                    Select any document tool below or click the compact violet{" "}
                    <span className="text-violet-300 font-semibold">Upload</span> button on any card to validate and stage your file.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => quickUploadInputRef.current?.click()}
                    className="w-full sm:w-auto min-h-[42px] px-4 py-2.5 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                  >
                    <UploadSvgIcon className="w-4 h-4 text-violet-600" />
                    <span>Upload Document</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleToolSelect({
                        id: "create-document",
                        title: "Create Document",
                        workspaceRoute: "/workspace/create-document",
                      })
                    }
                    className="w-full sm:w-auto min-h-[42px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Create Document</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveSection("all-tools")}
                    className="w-full sm:w-auto min-h-[42px] px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/15 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <span>View All Tools</span>
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Contextual Status Banner */}
          {selectedToolNotice && (
            <div
              role="status"
              className={`rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs border ${
                selectedToolNotice.isError
                  ? "bg-red-50 border-red-200/90"
                  : "bg-blue-50/90 border-blue-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    selectedToolNotice.isError
                      ? "bg-red-600 text-white"
                      : "bg-blue-600 text-white"
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={
                        selectedToolNotice.isError
                          ? "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          : "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      }
                    />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      className={`text-sm font-bold ${
                        selectedToolNotice.isError ? "text-red-950" : "text-slate-900"
                      }`}
                    >
                      {selectedToolNotice.title}
                    </h3>
                    {selectedToolNotice.route && (
                      <code className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-white/80 border border-blue-200 text-blue-800">
                        {selectedToolNotice.route}
                      </code>
                    )}
                  </div>
                  <p
                    className={`text-xs sm:text-sm mt-0.5 leading-relaxed ${
                      selectedToolNotice.isError ? "text-red-800" : "text-slate-600"
                    }`}
                  >
                    {selectedToolNotice.message}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedToolNotice(null)}
                className="self-end sm:self-center min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-white/80 transition-colors shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ── Categorized Tools Grid ── */}
          {(activeSection === "dashboard" ||
            activeSection === "all-tools" ||
            activeSection === "ai-analysis") && (
            <div className="space-y-8">
              {filteredCategories.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-8 sm:p-12 text-center">
                  <p className="text-base font-semibold text-slate-800">
                    No matching tools found for "{searchQuery}"
                  </p>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    Try searching for PDF, Word, Merge, Compress, or AI Analysis.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="mt-4 min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs sm:text-sm font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    Clear Search
                  </button>
                </div>
              ) : (
                filteredCategories.map((category) => (
                  <section key={category.id} className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-200/80 pb-3">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-base sm:text-lg font-bold text-slate-900">
                          {category.title}
                        </h3>
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${category.badgeColor}`}
                        >
                          {category.tools.length}{" "}
                          {category.tools.length === 1 ? "tool" : "tools"}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-500">
                        {category.description}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
                      {category.tools.map((tool) => renderToolCard(tool, category))}
                    </div>
                  </section>
                ))
              )}

              {/* ── Dashboard Bottom Overview ── */}
              {activeSection === "dashboard" && (
                <section
                  aria-label="Recent files and recent activity"
                  className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2"
                >
                  <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
                            <ToolIcon type="clock" className="w-4 h-4" />
                          </span>
                          <div>
                            <h3 className="text-sm sm:text-base font-bold text-slate-900">
                              Recent Files
                            </h3>
                            <p className="text-[11px] text-slate-500">
                              Real files selected in your workspace
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveSection("recent-files")}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                        >
                          View All ({recentFiles.length})
                        </button>
                      </div>

                      {recentFiles.length === 0 ? (
                        <div className="py-8 text-center">
                          <p className="text-xs sm:text-sm font-semibold text-slate-700">
                            No recent files yet
                          </p>
                          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                            Files you select using the violet Upload button on any tool card or Quick Upload will appear here with real metadata.
                          </p>
                        </div>
                      ) : (
                        <ul className="divide-y divide-slate-100 mt-2">
                          {recentFiles.slice(0, 4).map((file) => (
                            <li
                              key={file.id}
                              className="py-2.5 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-slate-900 truncate">
                                  {file.name}
                                </p>
                                <p className="text-[11px] text-slate-500 truncate">
                                  {file.toolTitle} • {formatFileSize(file.size)} •{" "}
                                  {formatTimestamp(file.selectedAt)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(file.workspaceRoute, {
                                    state: { initialFiles: file.rawFile ? [file.rawFile] : [] },
                                  })
                                }
                                className="px-2 py-1 rounded-lg text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
                              >
                                Open
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                            <ToolIcon type="sparkles" className="w-4 h-4" />
                          </span>
                          <div>
                            <h3 className="text-sm sm:text-base font-bold text-slate-900">
                              Recent Activity
                            </h3>
                            <p className="text-[11px] text-slate-500">
                              Actual actions performed in your workspace
                            </p>
                          </div>
                        </div>
                        {recentActivity.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setRecentActivity([])}
                            className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            Clear Log
                          </button>
                        )}
                      </div>

                      {recentActivity.length === 0 ? (
                        <div className="py-8 text-center">
                          <p className="text-xs sm:text-sm font-semibold text-slate-700">
                            No workspace activity recorded yet
                          </p>
                          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                            Your file selections, tool inspections, and document edits will be logged here in real time.
                          </p>
                        </div>
                      ) : (
                        <ul className="divide-y divide-slate-100 mt-2">
                          {recentActivity.slice(0, 4).map((act) => (
                            <li
                              key={act.id}
                              className="py-2.5 flex items-start justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-slate-800 break-words">
                                  {act.detail}
                                </p>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  {formatTimestamp(act.timestamp)}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ── VIEW: My Documents ── */}
          {activeSection === "my-documents" && (
            <section className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    My Documents
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    Real documents saved or drafted in your workspace ({myDocuments.length}).
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => navigate("/workspace/create-document")}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Create Document</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection("all-tools")}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                  >
                    Browse All Tools
                  </button>
                </div>
              </div>

              {myDocuments.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-12 text-center shadow-2xs">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mb-4">
                    <ToolIcon type="folder" className="w-7 h-7" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    No saved documents yet
                  </h3>
                  <p className="mt-1.5 text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                    Documents you create in the Document Creator or explicitly retain in your workspace will appear here. Click <strong>Create Document</strong> to draft your first document.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                          <ToolIcon type="word" className="w-5 h-5" />
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                          {doc.status}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-slate-900 break-words">
                          {doc.name}
                        </h4>
                        <p className="text-xs text-slate-500 mt-1">
                          Source: <span className="font-medium text-slate-700">{doc.sourceTool}</span> • Size:{" "}
                          <span className="font-medium text-slate-700">{formatFileSize(doc.size)}</span>
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Saved: {formatTimestamp(doc.savedAt)}
                        </p>
                      </div>

                      <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(doc.workspaceRoute || "/workspace/create-document")}
                          className="min-h-[32px] px-3 py-1 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                        >
                          Open in Editor
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (doc.id.startsWith("draft-")) {
                              localStorage.removeItem("ai_doc_workspace_draft_v1");
                            }
                            setMyDocuments((prev) => prev.filter((d) => d.id !== doc.id));
                          }}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── VIEW: Recent Files & Activity ── */}
          {activeSection === "recent-files" && (
            <div className="space-y-6">
              <section className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900">
                      Recent Files & Activity
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      Displays genuine files staged or opened across all workspace tools ({recentFiles.length}).
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => quickUploadInputRef.current?.click()}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                    >
                      <UploadSvgIcon className="w-3.5 h-3.5" />
                      <span>Select File</span>
                    </button>

                    {recentFiles.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setRecentFiles([]);
                          setCardFilesByTool({});
                          recordActivity(
                            "files_cleared",
                            "Cleared all files from Recent Files history"
                          );
                        }}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                      >
                        Clear All Files
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2 border-t border-slate-100">
                  <div className="relative flex-1">
                    <input
                      type="search"
                      value={recentSearchQuery}
                      onChange={(e) => setRecentSearchQuery(e.target.value)}
                      placeholder="Filter recent files by filename or tool name..."
                      aria-label="Filter recent files"
                      className="w-full h-10 px-3.5 rounded-xl bg-slate-50 border border-slate-200/90 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      { id: "all", label: "All Formats" },
                      { id: "pdf", label: "PDF" },
                      { id: "word", label: "Word" },
                      { id: "other", label: "Other" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setRecentTypeFilter(tab.id)}
                        className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                          recentTypeFilter === tab.id
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {filteredRecentFiles.length === 0 ? (
                <section className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-10 text-center shadow-2xs">
                  <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mb-3">
                    <ToolIcon type="clock" className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    {recentFiles.length === 0
                      ? "No recent files yet"
                      : "No files match your current filter"}
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                    {recentFiles.length === 0
                      ? "When you upload a file on any feature card or via Quick Upload, its real filename, size, file type, timestamp, and target tool will be listed here."
                      : "Try clearing the search query or switching the file format filter to see all selected files."}
                  </p>
                </section>
              ) : (
                <section className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
                  <div className="divide-y divide-slate-100">
                    {filteredRecentFiles.map((item) => (
                      <div
                        key={item.id}
                        className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900 break-all">
                              {item.name}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-violet-50 text-violet-700 border border-violet-200">
                              {item.extension || item.type}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">
                            Size: <span className="font-semibold">{formatFileSize(item.size)}</span>{" "}
                            • Tool: <span className="font-semibold">{item.toolTitle}</span> • File Modified:{" "}
                            <span>{formatTimestamp(item.lastModified)}</span>
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Selected at {formatTimestamp(item.selectedAt)} • Target route:{" "}
                            <code className="font-mono text-slate-600">{item.workspaceRoute}</code>
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() =>
                              navigate(item.workspaceRoute, {
                                state: { initialFiles: item.rawFile ? [item.rawFile] : [] },
                              })
                            }
                            className="min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          >
                            Open in Tool
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setRecentFiles((prev) => prev.filter((f) => f.id !== item.id))
                            }
                            className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900">
                      Recent Activity Log
                    </h3>
                    <p className="text-xs text-slate-500">
                      Real-time log of user actions performed in your workspace
                    </p>
                  </div>
                  {recentActivity.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRecentActivity([])}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Clear Activity
                    </button>
                  )}
                </div>

                {recentActivity.length === 0 ? (
                  <p className="text-xs sm:text-sm text-slate-500 py-4 text-center">
                    No workspace actions recorded yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {recentActivity.map((act) => (
                      <li
                        key={act.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs sm:text-sm"
                      >
                        <span className="font-medium text-slate-800 break-words">
                          {act.detail}
                        </span>
                        <span className="text-xs text-slate-400 shrink-0">
                          {formatTimestamp(act.timestamp)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {/* ── VIEW: Expanded Settings (Preserved Exactly) ── */}
          {activeSection === "settings" && (
            <div className="max-w-4xl space-y-6">
              {/* (a) Profile Settings */}
              <section className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-7 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      1. Profile Information
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      Loaded directly from your authenticated session in <code className="font-mono text-xs">localStorage</code>.
                    </p>
                  </div>
                  <span className="self-start sm:self-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                    Read-only (Profile update API pending)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                    <span className="text-xs font-medium text-slate-500 block">
                      Full Name
                    </span>
                    <span className="text-sm font-semibold text-slate-900 mt-1 block break-words">
                      {userName || "Not provided during registration"}
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                    <span className="text-xs font-medium text-slate-500 block">
                      Email Address
                    </span>
                    <span className="text-sm font-semibold text-slate-900 mt-1 block break-all">
                      {userEmail || "Not available"}
                    </span>
                  </div>
                </div>
              </section>

              {/* (b) Appearance Settings */}
              <section className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-7 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      2. Appearance
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      Choose your preferred workspace visual theme and card layout density.
                    </p>
                  </div>
                  <span className="self-start sm:self-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Saved locally
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      Theme Preference
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {[
                        {
                          id: "light",
                          title: "Light Mode (Active)",
                          note: "Default crisp SaaS light theme",
                        },
                        {
                          id: "dark",
                          title: "Dark Mode",
                          note: "Preference saved (Global dark theme CSS pending)",
                        },
                        {
                          id: "system",
                          title: "System Default",
                          note: "Preference saved locally",
                        },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            updatePreference(
                              "theme",
                              opt.id,
                              `Changed theme preference to "${opt.title}"`
                            )
                          }
                          className={`min-h-[56px] p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            prefs.theme === opt.id
                              ? "border-blue-600 bg-blue-50/60 ring-1 ring-blue-600/20"
                              : "border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <p className="text-xs font-bold text-slate-900">{opt.title}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{opt.note}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* (c) Workspace Preferences */}
              <section className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-7 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      3. Workspace Preferences
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      Customize default dashboard behavior in this browser.
                    </p>
                  </div>
                  <span className="self-start sm:self-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Active immediately
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-slate-900">
                        Default Opening Section
                      </p>
                      <p className="text-xs text-slate-500">
                        Choose which view opens first when you load `/dashboard`.
                      </p>
                    </div>
                    <select
                      value={prefs.defaultSection}
                      onChange={(e) =>
                        updatePreference(
                          "defaultSection",
                          e.target.value,
                          `Updated default dashboard view to "${e.target.value}"`
                        )
                      }
                      aria-label="Default opening section"
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-600"
                    >
                      <option value="dashboard">Dashboard Overview</option>
                      <option value="all-tools">All Tools</option>
                      <option value="recent-files">Recent Files</option>
                      <option value="my-documents">My Documents</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-slate-900">
                        Compact Feature Card Density
                      </p>
                      <p className="text-xs text-slate-500">
                        Slightly tighter padding on tool cards to fit more content on screen.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={prefs.compactCards}
                      onClick={() =>
                        updatePreference(
                          "compactCards",
                          !prefs.compactCards,
                          `${!prefs.compactCards ? "Enabled" : "Disabled"} compact card density`
                        )
                      }
                      className={`min-h-[32px] w-12 rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                        prefs.compactCards ? "bg-blue-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                          prefs.compactCards ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-slate-900">
                        Confirm Before Removing Selected File on Card
                      </p>
                      <p className="text-xs text-slate-500">
                        Ask for confirmation when clicking the clear (`×`) button on a tool card.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={prefs.confirmBeforeClearFile}
                      onClick={() =>
                        updatePreference(
                          "confirmBeforeClearFile",
                          !prefs.confirmBeforeClearFile,
                          `${
                            !prefs.confirmBeforeClearFile ? "Enabled" : "Disabled"
                          } file removal confirmation`
                        )
                      }
                      className={`min-h-[32px] w-12 rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                        prefs.confirmBeforeClearFile ? "bg-blue-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                          prefs.confirmBeforeClearFile ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </section>

              {/* (d) Security Settings */}
              <section className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-7 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      4. Security & Authentication
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      Current session status and password management.
                    </p>
                  </div>
                  <span className="self-start sm:self-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    JWT Session Active
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                    <span className="text-xs font-medium text-slate-500 block">
                      Authentication Method
                    </span>
                    <span className="text-sm font-semibold text-slate-900 mt-1 block">
                      Bearer Token (`localStorage`)
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                    <span className="text-xs font-medium text-slate-500 block">
                      Password & Two-Factor Auth
                    </span>
                    <span className="text-xs text-slate-600 mt-1 block">
                      Requires backend `/api/auth/change-password` endpoint integration.
                    </span>
                  </div>
                </div>
              </section>

              {/* (e) Notifications Settings */}
              <section className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-7 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      5. Notifications
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      Control in-app status banners and file validation alerts.
                    </p>
                  </div>
                  <span className="self-start sm:self-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    In-app controls active
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-slate-900">
                        File Selection Status Banners
                      </p>
                      <p className="text-xs text-slate-500">
                        Show a confirmation notice at the top of the dashboard when a file is staged on a card.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={prefs.showActivityToasts}
                      onClick={() =>
                        updatePreference(
                          "showActivityToasts",
                          !prefs.showActivityToasts,
                          `${
                            !prefs.showActivityToasts ? "Enabled" : "Disabled"
                          } file selection status banners`
                        )
                      }
                      className={`min-h-[32px] w-12 rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                        prefs.showActivityToasts ? "bg-blue-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                          prefs.showActivityToasts ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-slate-900">
                        Unsupported File Format Alerts
                      </p>
                      <p className="text-xs text-slate-500">
                        Show a top-level warning banner in addition to the inline card message if an invalid file type is chosen.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={prefs.showValidationAlerts}
                      onClick={() =>
                        updatePreference(
                          "showValidationAlerts",
                          !prefs.showValidationAlerts,
                          `${
                            !prefs.showValidationAlerts ? "Enabled" : "Disabled"
                          } top-level validation alerts`
                        )
                      }
                      className={`min-h-[32px] w-12 rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                        prefs.showValidationAlerts ? "bg-blue-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                          prefs.showValidationAlerts ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </section>

              {/* (f) Storage Overview */}
              <section className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-7 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      6. Storage & Local Session Files
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      Real-time summary of files selected in your browser memory during this session.
                    </p>
                  </div>
                  <span className="self-start sm:self-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                    Cloud storage API pending
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                    <span className="text-xs font-medium text-slate-500 block">
                      Session Selected Files
                    </span>
                    <span className="text-lg font-bold text-slate-900 mt-1 block">
                      {sessionStorageStats.totalFilesSelected}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                    <span className="text-xs font-medium text-slate-500 block">
                      Total Local Selection Size
                    </span>
                    <span className="text-lg font-bold text-slate-900 mt-1 block">
                      {sessionStorageStats.formattedSize}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                    <span className="text-xs font-medium text-slate-500 block">
                      Cards with Staged Files
                    </span>
                    <span className="text-lg font-bold text-violet-700 mt-1 block">
                      {sessionStorageStats.activeCardCount}
                    </span>
                  </div>
                </div>
              </section>

              {/* (g) Account Actions */}
              <section className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-7 shadow-2xs space-y-4">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    7. Account & Session Actions
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    Reset local workspace selections or sign out of your account.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmLogoutModal(true)}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs sm:text-sm font-semibold text-white shadow-xs transition-colors cursor-pointer"
                  >
                    Sign Out of Workspace
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRecentFiles([]);
                      setRecentActivity([]);
                      setCardFilesByTool({});
                      setCardErrorsByTool({});
                      setSelectedToolNotice({
                        title: "Session Selections Cleared",
                        message:
                          "All locally selected files and session activity logs have been cleared.",
                        isError: false,
                      });
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    Clear Session Files & Activity
                  </button>

                  <Link
                    to="/"
                    className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 inline-flex items-center transition-colors"
                  >
                    Return to Public Homepage
                  </Link>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}