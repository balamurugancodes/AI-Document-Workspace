import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// ── File Size Formatting Helper ──────────────────────────────────────────────
function formatBytes(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

// ── Resilient PDF.js Dynamic Loader & Worker Setup ────────────────────────────
let pdfjsLibInstance = null;

async function loadPDFJS() {
  if (pdfjsLibInstance) return pdfjsLibInstance;
  if (typeof window !== "undefined" && window.pdfjsLib) {
    pdfjsLibInstance = window.pdfjsLib;
    return pdfjsLibInstance;
  }
  try {
    const pdfjs = await import("pdfjs-dist");
    const lib = pdfjs.default || pdfjs;
    if (lib && lib.getDocument) {
      if (!lib.GlobalWorkerOptions.workerSrc) {
        lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${
          lib.version || "3.11.174"
        }/pdf.worker.min.js`;
      }
      pdfjsLibInstance = lib;
      return pdfjsLibInstance;
    }
  } catch {
    // Dynamic CDN fallback
  }

  if (typeof window !== "undefined") {
    if (!window.__pdfjsLoadingPromise) {
      window.__pdfjsLoadingPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.async = true;
        script.onload = () => {
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
              "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
            resolve(window.pdfjsLib);
          } else {
            reject(new Error("pdfjsLib not available on window."));
          }
        };
        script.onerror = () => reject(new Error("Unable to load PDF.js from CDN."));
        document.head.appendChild(script);
      });
    }
    pdfjsLibInstance = await window.__pdfjsLoadingPromise;
    return pdfjsLibInstance;
  }
  throw new Error("PDF.js unavailable.");
}

// ── Quality & Resolution Presets ──────────────────────────────────────────────
const QUALITY_PRESETS = [
  {
    id: "high",
    name: "High Quality (300 DPI)",
    scale: 2.0,
    quality: 0.95,
    badge: "Print Ready",
    desc: "Maximum resolution and sharp text. Best for printing and archiving.",
  },
  {
    id: "standard",
    name: "Standard (150 DPI)",
    scale: 1.5,
    quality: 0.88,
    badge: "Recommended",
    desc: "Balanced sharpness and efficient file size. Ideal for presentations.",
  },
  {
    id: "compact",
    name: "Compact (72 DPI)",
    scale: 1.0,
    quality: 0.75,
    badge: "Web / Email",
    desc: "Smaller file size and fast loading. Great for emails and chat sharing.",
  },
];

// ── Page Range Parser Helper ──────────────────────────────────────────────────
function parsePageRange(rangeStr, totalPages) {
  if (!rangeStr || !rangeStr.trim()) return [];
  const pages = new Set();
  const parts = rangeStr.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const segments = trimmed.split("-");
      if (segments.length !== 2) return null;
      const start = parseInt(segments[0].trim(), 10);
      const end = parseInt(segments[1].trim(), 10);
      if (isNaN(start) || isNaN(end) || start < 1 || end < start) return null;
      for (let p = Math.max(1, start); p <= Math.min(totalPages, end); p++) {
        pages.add(p);
      }
    } else {
      const page = parseInt(trimmed, 10);
      if (isNaN(page) || page < 1 || page > totalPages) return null;
      pages.add(page);
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

// ── Component Definition ──────────────────────────────────────────────────────
export default function PDFToJPG() {
  const location = useLocation();
  const navigate = useNavigate();

  // State: Document & File
  const [file, setFile] = useState(null);
  const [arrayBuffer, setArrayBuffer] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [renderingPreview, setRenderingPreview] = useState(false);
  const [docError, setDocError] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // State: Settings
  const [pageScope, setPageScope] = useState("all"); // 'all' | 'current' | 'custom'
  const [customRange, setCustomRange] = useState("");
  const [qualityPresetId, setQualityPresetId] = useState("standard");

  // State: Conversion & Output
  const [converting, setConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [convertedImages, setConvertedImages] = useState([]);
  const [convertError, setConvertError] = useState(null);
  const [activeModalImage, setActiveModalImage] = useState(null);

  // References
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const pdfDocRef = useRef(null);
  const isAbortedRef = useRef(false);
  const createdUrlsRef = useRef([]);

  // Cleanup helper for object URLs
  const cleanupObjectUrls = useCallback(() => {
    createdUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore revocation errors
      }
    });
    createdUrlsRef.current = [];
  }, []);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      cleanupObjectUrls();
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignore cancellation errors
        }
      }
      if (pdfDocRef.current) {
        try {
          pdfDocRef.current.destroy();
        } catch {
          // Ignore destroy errors
        }
      }
    };
  }, [cleanupObjectUrls]);

  // ── Document Loader ─────────────────────────────────────────────────────────
  const loadPDFDocument = useCallback(
    async (fileObj) => {
      setLoadingDoc(true);
      setDocError(null);
      setConvertError(null);
      setConvertedImages([]);
      cleanupObjectUrls();

      try {
        if (!fileObj.name.toLowerCase().endsWith(".pdf") && fileObj.type !== "application/pdf") {
          throw new Error("Invalid file format. Please select a valid PDF document (.pdf).");
        }
        if (fileObj.size === 0) {
          throw new Error("The selected file is empty (0 bytes). Please upload a valid PDF.");
        }
        if (fileObj.size > 100 * 1024 * 1024) {
          throw new Error("File exceeds 100 MB limit. Please select a smaller PDF.");
        }

        const buffer = await fileObj.arrayBuffer();
        const pdfjs = await loadPDFJS();

        // Destroy previous instance if present
        if (pdfDocRef.current) {
          try {
            await pdfDocRef.current.destroy();
          } catch {
            // Ignore destroy errors
          }
        }

        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(buffer),
          cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;
        pdfDocRef.current = doc;

        setFile(fileObj);
        setArrayBuffer(buffer);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setCustomRange(`1-${doc.numPages}`);
      } catch (err) {
        let msg = err.message || "Failed to load PDF document.";
        if (err.name === "PasswordException") {
          msg = "This PDF is password-protected. Please unlock or decrypt it first.";
        } else if (err.name === "InvalidPDFException") {
          msg = "The PDF file is corrupted or not recognized as a valid PDF.";
        }
        setDocError(msg);
        setFile(null);
        setArrayBuffer(null);
        setNumPages(0);
      } finally {
        setLoadingDoc(false);
      }
    },
    [cleanupObjectUrls]
  );

  // Check initial forwarded files from Dashboard
  useEffect(() => {
    if (location.state?.initialFiles && location.state.initialFiles.length > 0) {
      const initial = location.state.initialFiles[0];
      loadPDFDocument(initial);
    }
  }, [location.state, loadPDFDocument]);

  // ── Render Preview Canvas ───────────────────────────────────────────────────
  const renderCurrentPagePreview = useCallback(async () => {
    if (!pdfDocRef.current || currentPage < 1 || currentPage > numPages || !canvasRef.current) {
      return;
    }

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // Ignore cancellation errors
      }
    }

    setRenderingPreview(true);

    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const baseScale = (zoom / 100) * 1.25;
      const viewport = page.getViewport({ scale: baseScale });
      const ctx = canvas.getContext("2d", { alpha: false });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      // Compositing white background for crisp rendering
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: ctx,
        viewport,
      };

      const task = page.render(renderContext);
      renderTaskRef.current = task;
      await task.promise;
    } catch (err) {
      if (err.name !== "RenderingCancelledException") {
        console.error("Preview rendering error:", err);
      }
    } finally {
      setRenderingPreview(false);
    }
  }, [currentPage, numPages, zoom]);

  useEffect(() => {
    renderCurrentPagePreview();
  }, [renderCurrentPagePreview]);

  // ── Drag & Drop Handlers ────────────────────────────────────────────────────
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      loadPDFDocument(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      loadPDFDocument(e.target.files[0]);
    }
  };

  // ── Reset Handler ───────────────────────────────────────────────────────────
  const handleReset = () => {
    cleanupObjectUrls();
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // Ignore cancellation errors
      }
    }
    if (pdfDocRef.current) {
      try {
        pdfDocRef.current.destroy();
      } catch {
        // Ignore destroy errors
      }
    }
    pdfDocRef.current = null;
    setFile(null);
    setArrayBuffer(null);
    setNumPages(0);
    setCurrentPage(1);
    setConvertedImages([]);
    setDocError(null);
    setConvertError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Page Selection Resolution ───────────────────────────────────────────────
  const resolvedTargetPages = useMemo(() => {
    if (numPages === 0) return [];
    if (pageScope === "all") {
      return Array.from({ length: numPages }, (_, i) => i + 1);
    }
    if (pageScope === "current") {
      return [currentPage];
    }
    if (pageScope === "custom") {
      const parsed = parsePageRange(customRange, numPages);
      return parsed === null ? [] : parsed;
    }
    return [];
  }, [pageScope, customRange, numPages, currentPage]);

  const isCustomRangeInvalid = useMemo(() => {
    if (pageScope !== "custom") return false;
    return parsePageRange(customRange, numPages) === null;
  }, [pageScope, customRange, numPages]);

  const selectedPreset = useMemo(() => {
    return QUALITY_PRESETS.find((p) => p.id === qualityPresetId) || QUALITY_PRESETS[1];
  }, [qualityPresetId]);

  // ── PDF to JPG Conversion Engine ───────────────────────────────────────────
  const handleConvertToJPG = async () => {
    if (!pdfDocRef.current || resolvedTargetPages.length === 0 || converting) return;

    setConverting(true);
    setConvertError(null);
    setConvertedImages([]);
    cleanupObjectUrls();
    isAbortedRef.current = false;

    const total = resolvedTargetPages.length;
    setConvertProgress({ current: 0, total, percent: 0 });

    const results = [];
    const baseName = file?.name?.replace(/\.[^/.]+$/, "") || "document";

    try {
      for (let i = 0; i < total; i++) {
        if (isAbortedRef.current) {
          throw new Error("Conversion was canceled by user.");
        }

        const pageNum = resolvedTargetPages[i];
        setConvertProgress({
          current: i + 1,
          total,
          percent: Math.round(((i + 1) / total) * 100),
        });

        const page = await pdfDocRef.current.getPage(pageNum);
        const viewport = page.getViewport({ scale: selectedPreset.scale });

        // Offscreen canvas for rasterization
        const offscreenCanvas = document.createElement("canvas");
        offscreenCanvas.width = Math.floor(viewport.width);
        offscreenCanvas.height = Math.floor(viewport.height);

        const ctx = offscreenCanvas.getContext("2d", { alpha: false });

        // Solid white background is required for JPEG format
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

        const renderContext = {
          canvasContext: ctx,
          viewport,
        };

        await page.render(renderContext).promise;

        // Convert rasterized canvas to JPEG Blob
        const blob = await new Promise((resolve, reject) => {
          offscreenCanvas.toBlob(
            (b) => {
              if (b) resolve(b);
              else reject(new Error(`Failed to encode Page ${pageNum} to JPEG.`));
            },
            "image/jpeg",
            selectedPreset.quality
          );
        });

        const objectUrl = URL.createObjectURL(blob);
        createdUrlsRef.current.push(objectUrl);

        results.push({
          pageNumber: pageNum,
          blob,
          objectUrl,
          width: offscreenCanvas.width,
          height: offscreenCanvas.height,
          sizeBytes: blob.size,
          filename: `${baseName}_page_${pageNum}.jpg`,
        });
      }

      setConvertedImages(results);
    } catch (err) {
      if (err.message !== "Conversion was canceled by user.") {
        setConvertError(err.message || "An unexpected error occurred during JPG conversion.");
      }
    } finally {
      setConverting(false);
    }
  };

  const handleCancelConversion = () => {
    isAbortedRef.current = true;
    setConverting(false);
  };

  // ── Download Helpers ────────────────────────────────────────────────────────
  const handleDownloadSingle = (image) => {
    const link = document.createElement("a");
    link.href = image.objectUrl;
    link.download = image.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = async () => {
    if (convertedImages.length === 0) return;
    for (let i = 0; i < convertedImages.length; i++) {
      handleDownloadSingle(convertedImages[i]);
      if (i < convertedImages.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 antialiased selection:bg-blue-100 selection:text-blue-900">
      {/* ── Top Workspace Header ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors cursor-pointer shrink-0"
            title="Return to Dashboard"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span className="hidden xs:inline">Dashboard</span>
          </button>

          <div className="h-5 w-px bg-slate-200 shrink-0" />

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate">
                PDF to JPG
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-500 hidden sm:block truncate">
                Convert PDF pages into high-resolution JPG images
              </p>
            </div>
          </div>
        </div>

        {file && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100/80 rounded-lg transition-colors cursor-pointer"
            >
              Reset
            </button>
          </div>
        )}
      </header>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* ── Main Workspace Content ────────────────────────────────────────── */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        {/* Error Notification Banner */}
        {docError && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-3 shadow-xs">
            <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div className="flex-1 text-sm">
              <p className="font-semibold text-red-900">Document Notice</p>
              <p className="mt-0.5 text-red-700">{docError}</p>
            </div>
            <button
              type="button"
              onClick={() => setDocError(null)}
              className="text-red-400 hover:text-red-700 p-1"
            >
              &times;
            </button>
          </div>
        )}

        {/* ── EMPTY STATE: Upload Zone ────────────────────────────────────── */}
        {!file && (
          <div className="flex-1 flex flex-col items-center justify-center py-8 sm:py-12">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full max-w-2xl border-2 border-dashed rounded-3xl p-8 sm:p-14 text-center cursor-pointer transition-all duration-200 bg-white shadow-xs ${
                isDragOver
                  ? "border-blue-500 bg-blue-50/50 scale-[1.01]"
                  : "border-slate-300 hover:border-blue-400 hover:bg-slate-50/60"
              }`}
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5 shadow-inner">
                <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
                Upload a PDF to Convert to JPG
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-6">
                Drag and drop your PDF here, or browse files from your computer. Pages will be converted into high-quality JPEG images.
              </p>

              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md transition-all active:scale-[0.98]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>Browse PDF File</span>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Client-side processing
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Up to 100 MB
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Up to 300 DPI resolution
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── LOADED STATE: Two-Column Workspace ───────────────────────────── */}
        {file && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ── LEFT COLUMN: PDF Preview & Info (7 cols on Desktop) ──────── */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              {/* Document Info Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate max-w-xs sm:max-w-md" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatBytes(file.size)} &bull; {numPages} {numPages === 1 ? "page" : "pages"}
                    </p>
                  </div>
                </div>

                {/* Preview Zoom Controls */}
                <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(50, z - 25))}
                    disabled={zoom <= 50}
                    className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white text-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
                    title="Zoom Out"
                  >
                    &minus;
                  </button>
                  <span className="text-xs font-semibold text-slate-700 min-w-[3rem] text-center">
                    {zoom}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(200, z + 25))}
                    disabled={zoom >= 200}
                    className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white text-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
                    title="Zoom In"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom(100)}
                    className="px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 rounded hover:bg-white transition-colors cursor-pointer"
                    title="Reset Zoom"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* PDF Preview Canvas Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">Page Preview</span>
                  {numPages > 0 && (
                    <span>
                      Page {currentPage} of {numPages}
                    </span>
                  )}
                </div>

                <div className="relative min-h-[360px] max-h-[580px] bg-slate-100/70 rounded-xl overflow-auto p-4 flex items-center justify-center border border-slate-200/60 my-3">
                  {renderingPreview && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-2xs flex flex-col items-center justify-center z-10">
                      <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs font-medium text-slate-600 mt-2">Rendering Page...</span>
                    </div>
                  )}

                  <canvas
                    ref={canvasRef}
                    className="shadow-md rounded-sm max-w-full bg-white transition-transform"
                    style={{ display: numPages > 0 ? "block" : "none" }}
                  />
                </div>

                {/* Page Navigation Controls */}
                <div className="flex items-center justify-between pt-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1 || renderingPreview}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                    Previous
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Go to:</span>
                    <select
                      value={currentPage}
                      onChange={(e) => setCurrentPage(parseInt(e.target.value, 10))}
                      disabled={renderingPreview}
                      className="px-2 py-1 bg-white border border-slate-200 rounded-md text-slate-700 font-medium cursor-pointer"
                    >
                      {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                        <option key={p} value={p}>
                          Page {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                    disabled={currentPage >= numPages || renderingPreview}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    Next
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* ── RIGHT COLUMN: Settings & Execution (5 cols on Desktop) ──── */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              {/* Settings Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-slate-500 mb-4">
                  Conversion Settings
                </h3>

                {/* 1. Page Selection Mode */}
                <div className="mb-5">
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Pages to Convert
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPageScope("all")}
                      disabled={converting}
                      className={`py-2 px-2.5 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                        pageScope === "all"
                          ? "bg-blue-50 border-blue-600 text-blue-700 shadow-2xs"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      All Pages
                    </button>
                    <button
                      type="button"
                      onClick={() => setPageScope("current")}
                      disabled={converting}
                      className={`py-2 px-2.5 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                        pageScope === "current"
                          ? "bg-blue-50 border-blue-600 text-blue-700 shadow-2xs"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Page {currentPage} Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setPageScope("custom")}
                      disabled={converting}
                      className={`py-2 px-2.5 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                        pageScope === "custom"
                          ? "bg-blue-50 border-blue-600 text-blue-700 shadow-2xs"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Custom Range
                    </button>
                  </div>

                  {/* Custom Range Input */}
                  {pageScope === "custom" && (
                    <div className="mt-3">
                      <div className="relative">
                        <input
                          type="text"
                          value={customRange}
                          onChange={(e) => setCustomRange(e.target.value)}
                          placeholder="e.g. 1-3, 5"
                          disabled={converting}
                          className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-mono transition-all ${
                            isCustomRangeInvalid
                              ? "border-red-400 bg-red-50/30 text-red-900 focus:ring-2 focus:ring-red-200"
                              : "border-slate-300 bg-white text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          }`}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-[11px]">
                        <span className="text-slate-400">Example: 1-3, 5</span>
                        {isCustomRangeInvalid ? (
                          <span className="text-red-600 font-semibold">Invalid range syntax</span>
                        ) : (
                          <span className="text-blue-600 font-medium">
                            {resolvedTargetPages.length} {resolvedTargetPages.length === 1 ? "page" : "pages"} targeted
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {pageScope !== "custom" && (
                    <p className="mt-2 text-[11px] text-slate-500">
                      Targeting: <strong className="text-slate-700">{resolvedTargetPages.length}</strong> {resolvedTargetPages.length === 1 ? "page" : "pages"} for conversion.
                    </p>
                  )}
                </div>

                {/* 2. Image Resolution & Quality Setting */}
                <div className="mb-6">
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Image Resolution & Quality
                  </label>
                  <div className="space-y-2">
                    {QUALITY_PRESETS.map((preset) => {
                      const isSelected = qualityPresetId === preset.id;
                      return (
                        <div
                          key={preset.id}
                          onClick={() => !converting && setQualityPresetId(preset.id)}
                          className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                            isSelected
                              ? "border-blue-600 bg-blue-50/40 shadow-2xs"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">
                              {preset.name}
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                isSelected
                                  ? "bg-blue-600 text-white"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {preset.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                            {preset.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Primary Conversion Action Button */}
                <div className="pt-2">
                  {!converting ? (
                    <button
                      type="button"
                      onClick={handleConvertToJPG}
                      disabled={resolvedTargetPages.length === 0 || isCustomRangeInvalid}
                      className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span>
                        Convert {resolvedTargetPages.length} {resolvedTargetPages.length === 1 ? "Page" : "Pages"} to JPG
                      </span>
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-blue-700 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping inline-block" />
                          Converting Page {convertProgress.current} of {convertProgress.total}...
                        </span>
                        <span className="font-bold text-slate-700">{convertProgress.percent}%</span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/80">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all duration-300"
                          style={{ width: `${convertProgress.percent}%` }}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleCancelConversion}
                        className="w-full py-2 text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      >
                        Cancel Conversion
                      </button>
                    </div>
                  )}

                  {convertError && (
                    <p className="mt-3 text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
                      {convertError}
                    </p>
                  )}
                </div>
              </div>

              {/* Converted JPG Results Gallery */}
              {convertedImages.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Converted Images</h4>
                      <p className="text-[11px] text-slate-500">
                        {convertedImages.length} {convertedImages.length === 1 ? "image" : "images"} ready
                      </p>
                    </div>
                    {convertedImages.length > 1 && (
                      <button
                        type="button"
                        onClick={handleDownloadAll}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Download All
                      </button>
                    )}
                  </div>

                  {/* Cards Grid */}
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                    {convertedImages.map((img) => (
                      <div
                        key={img.pageNumber}
                        className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col justify-between"
                      >
                        <div
                          className="relative aspect-3/4 bg-white rounded-lg border border-slate-200/60 overflow-hidden cursor-pointer group mb-2"
                          onClick={() => setActiveModalImage(img)}
                          title="Click to view full image"
                        >
                          <img
                            src={img.objectUrl}
                            alt={`Page ${img.pageNumber}`}
                            className="w-full h-full object-contain"
                          />
                          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                            </svg>
                            View
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-bold text-slate-800">Page {img.pageNumber}</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {formatBytes(img.sizeBytes)}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mb-2">
                            {img.width} &times; {img.height} px
                          </p>

                          <button
                            type="button"
                            onClick={() => handleDownloadSingle(img)}
                            className="w-full py-1.5 px-2 bg-white border border-slate-300 hover:border-blue-500 hover:text-blue-600 rounded-lg text-xs font-semibold text-slate-700 transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                            Download JPG
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── High-Resolution Image Preview Modal ────────────────────────────── */}
      {activeModalImage && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Page {activeModalImage.pageNumber} Preview
                </h3>
                <p className="text-xs text-slate-500">
                  {activeModalImage.width} &times; {activeModalImage.height} px &bull; {formatBytes(activeModalImage.sizeBytes)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalImage(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-slate-100 flex items-center justify-center min-h-[300px]">
              <img
                src={activeModalImage.objectUrl}
                alt={`Page ${activeModalImage.pageNumber}`}
                className="max-w-full max-h-[65vh] object-contain rounded-md shadow-md bg-white"
              />
            </div>

            <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50">
              <button
                type="button"
                onClick={() => setActiveModalImage(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleDownloadSingle(activeModalImage)}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download This JPG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}