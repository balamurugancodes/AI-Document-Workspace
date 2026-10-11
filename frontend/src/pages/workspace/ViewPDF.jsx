import React, { useState, useEffect, useRef, useCallback } from "react";
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

// ── Dynamic PDF.js Loader & Worker Setup ─────────────────────────────────────
let pdfjsLibInstance = null;
async function loadPDFJS() {
  if (typeof window !== "undefined" && window.pdfjsLib) {
    return window.pdfjsLib;
  }
  if (pdfjsLibInstance) return pdfjsLibInstance;

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
      return lib;
    }
  } catch {
    // Dynamic fallback to CDN if bundler worker resolution fails
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
            pdfjsLibInstance = window.pdfjsLib;
            resolve(window.pdfjsLib);
          } else {
            reject(new Error("PDF.js loaded but library object not found."));
          }
        };
        script.onerror = () => reject(new Error("Failed to load PDF.js engine."));
        document.head.appendChild(script);
      });
    }
    return window.__pdfjsLoadingPromise;
  }

  throw new Error("PDF.js is unavailable in the current environment.");
}

// ── Zoom Constraints & Steps ─────────────────────────────────────────────────
const MIN_ZOOM = 0.5;   // 50%
const MAX_ZOOM = 2.5;   // 250%
const ZOOM_STEP = 0.15; // 15% per click

export default function ViewPDF() {
  const location = useLocation();
  const navigate = useNavigate();

  // Document state
  const [file, setFile] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInputVal, setPageInputVal] = useState("1");

  // Viewport & Zoom state
  const [scale, setScale] = useState(1.0);
  const [fitMode, setFitMode] = useState("auto"); // "auto" | "width" | "page" | "custom"
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(false);

  // Status & Error state
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // References
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const viewerContainerRef = useRef(null);
  const currentObjectUrlRef = useRef(null);

  // ── Resource Cleanup Helper ────────────────────────────────────────────────
  const cleanupObjectUrl = useCallback(() => {
    if (currentObjectUrlRef.current) {
      URL.revokeObjectURL(currentObjectUrlRef.current);
      currentObjectUrlRef.current = null;
    }
  }, []);

  const resetViewer = useCallback(() => {
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {}
      renderTaskRef.current = null;
    }
    cleanupObjectUrl();
    setFile(null);
    setPdfDoc(null);
    setNumPages(0);
    setCurrentPage(1);
    setPageInputVal("1");
    setScale(1.0);
    setFitMode("auto");
    setErrorMsg("");
    setIsLoadingDoc(false);
    setIsRenderingPage(false);
  }, [cleanupObjectUrl]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
      cleanupObjectUrl();
    };
  }, [cleanupObjectUrl]);

  // ── PDF Loading Engine ─────────────────────────────────────────────────────
  const loadPdfDocument = useCallback(
    async (fileObj) => {
      if (!fileObj) return;

      // Validation
      const isPdfType =
        fileObj.type === "application/pdf" ||
        fileObj.name.toLowerCase().endsWith(".pdf");

      if (!isPdfType) {
        setErrorMsg("Please upload a valid PDF document (.pdf).");
        return;
      }
      if (fileObj.size === 0) {
        setErrorMsg("The selected file is empty (0 bytes). Please upload a valid PDF.");
        return;
      }
      if (fileObj.size > 100 * 1024 * 1024) {
        setErrorMsg("File exceeds the 100 MB upload limit. Please select a smaller document.");
        return;
      }

      // Cleanup prior resources
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
        renderTaskRef.current = null;
      }
      cleanupObjectUrl();

      setErrorMsg("");
      setIsLoadingDoc(true);
      setFile(fileObj);
      setCurrentPage(1);
      setPageInputVal("1");
      setFitMode("auto");

      try {
        const arrayBuffer = await fileObj.arrayBuffer();
        const pdfjs = await loadPDFJS();
        const loadingTask = pdfjs.getDocument({
          data: arrayBuffer,
          cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        currentObjectUrlRef.current = URL.createObjectURL(fileObj);
      } catch (err) {
        console.error("PDF loading failed:", err);
        if (err.name === "PasswordException") {
          setErrorMsg("This PDF is password-protected. Please unlock it before viewing.");
        } else {
          setErrorMsg("Unable to open this PDF document. The file may be corrupted or unreadable.");
        }
        setPdfDoc(null);
        setNumPages(0);
      } finally {
        setIsLoadingDoc(false);
      }
    },
    [cleanupObjectUrl]
  );

  // ── Forwarded Files from Dashboard ─────────────────────────────────────────
  useEffect(() => {
    if (location.state?.initialFiles && location.state.initialFiles.length > 0) {
      const incoming = location.state.initialFiles[0];
      loadPdfDocument(incoming);
      // Clean location state to avoid reloading on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state, loadPdfDocument]);

  // ── Page Rendering Engine ──────────────────────────────────────────────────
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    // Cancel in-flight render task to prevent race conditions
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {}
      renderTaskRef.current = null;
    }

    setIsRenderingPage(true);

    try {
      const page = await pdfDoc.getPage(currentPage);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;

      // Base unscaled viewport
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      let computedScale = scale;

      // Calculate scale if in a fitting mode
      if (viewerContainerRef.current) {
        const containerWidth = viewerContainerRef.current.clientWidth - 48; // padding
        const containerHeight = viewerContainerRef.current.clientHeight - 48;

        if (fitMode === "width" && containerWidth > 100) {
          computedScale = containerWidth / unscaledViewport.width;
        } else if (fitMode === "page" && containerWidth > 100 && containerHeight > 100) {
          const scaleX = containerWidth / unscaledViewport.width;
          const scaleY = containerHeight / unscaledViewport.height;
          computedScale = Math.min(scaleX, scaleY);
        } else if (fitMode === "auto" && containerWidth > 100) {
          // Default: fit width comfortably, bounded between 0.75 and 1.35
          const ideal = containerWidth / unscaledViewport.width;
          computedScale = Math.min(Math.max(ideal, 0.75), 1.35);
        }
      }

      // Respect zoom limits
      computedScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, computedScale));
      if (fitMode !== "custom" && computedScale !== scale) {
        setScale(computedScale);
      }

      // High-DPI support (Retina / mobile crispness)
      const pixelRatio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: computedScale * pixelRatio });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
      canvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;

      // Fill canvas background with solid pure white
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      renderTaskRef.current = null;
    } catch (err) {
      if (err?.name !== "RenderingCancelledException") {
        console.error("Canvas render error:", err);
      }
    } finally {
      setIsRenderingPage(false);
    }
  }, [pdfDoc, currentPage, scale, fitMode]);

  // Trigger render on document, page, scale, or fitMode change
  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  // Re-render on container resize
  useEffect(() => {
    const handleResize = () => {
      if (fitMode !== "custom") {
        renderCurrentPage();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [fitMode, renderCurrentPage]);

  // ── Navigation & Page Jump ─────────────────────────────────────────────────
  const goToPage = useCallback(
    (target) => {
      const pageNum = parseInt(target, 10);
      if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
        setCurrentPage(pageNum);
        setPageInputVal(String(pageNum));
      } else {
        setPageInputVal(String(currentPage));
      }
    },
    [numPages, currentPage]
  );

  const prevPage = () => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  };

  const nextPage = () => {
    if (currentPage < numPages) {
      goToPage(currentPage + 1);
    }
  };

  const handlePageInputKeyDown = (e) => {
    if (e.key === "Enter") {
      goToPage(pageInputVal);
      e.target.blur();
    }
  };

  // ── Zoom Controls ──────────────────────────────────────────────────────────
  const zoomIn = () => {
    setFitMode("custom");
    setScale((prev) => Math.min(MAX_ZOOM, parseFloat((prev + ZOOM_STEP).toFixed(2))));
  };

  const zoomOut = () => {
    setFitMode("custom");
    setScale((prev) => Math.max(MIN_ZOOM, parseFloat((prev - ZOOM_STEP).toFixed(2))));
  };

  const resetZoom = () => {
    setFitMode("custom");
    setScale(1.0);
  };

  const handleFitWidth = () => {
    setFitMode("width");
  };

  const handleFitPage = () => {
    setFitMode("page");
  };

  // ── Fullscreen Toggle ──────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!viewerContainerRef.current) return;

    if (!document.fullscreenElement) {
      viewerContainerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch((err) => console.error("Fullscreen error:", err));
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch((err) => console.error("Exit fullscreen error:", err));
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // ── Keyboard Shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (!pdfDoc) return;

      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        prevPage();
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        nextPage();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // ── Download Original PDF ──────────────────────────────────────────────────
  const handleDownloadOriginal = () => {
    if (!file) return;
    const url = currentObjectUrlRef.current || URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name || "document.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Drag & Drop Event Handlers ─────────────────────────────────────────────
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      loadPdfDocument(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      loadPdfDocument(e.target.files[0]);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800">
      {/* ── Sticky Workspace Header (NO Homepage Button) ──────────────────── */}
      <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/70 rounded-lg transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-500/30"
            title="Return to Dashboard"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span className="hidden xs:inline">Dashboard</span>
          </button>

          <div className="h-5 w-px bg-slate-200 shrink-0" />

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              {/* Document Eye / Viewer Icon */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate leading-tight">
                Document Viewer
              </h1>
              <p className="text-xs text-slate-500 hidden md:block truncate">
                View and inspect PDF documents with advanced navigation and zoom controls
              </p>
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        {file && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadOriginal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200/80 transition-colors shadow-2xs"
              title="Download original file"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.5V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              type="button"
              onClick={resetViewer}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-600 bg-white hover:bg-red-50 rounded-lg border border-slate-200 transition-colors"
              title="Close document and select another"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="hidden sm:inline">Close</span>
            </button>
          </div>
        )}
      </header>

      {/* ── Main Workspace Content ────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Error Notification Banner */}
        {errorMsg && (
          <div className="mx-4 sm:mx-6 lg:mx-8 mt-4 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-sm text-red-800 shadow-xs">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="font-medium">{errorMsg}</p>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg("")}
              className="text-red-500 hover:text-red-700 p-0.5 rounded transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ── State 1: No Document Loaded (Upload Dropzone) ────────────────── */}
        {!file && (
          <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
            <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-10 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileInputChange}
                className="hidden"
              />

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-8 sm:p-12 transition-all cursor-pointer flex flex-col items-center justify-center ${
                  isDragging
                    ? "border-blue-500 bg-blue-50/60 scale-[1.01]"
                    : "border-slate-200 hover:border-blue-400 hover:bg-slate-50/50"
                }`}
              >
                <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 shadow-xs">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>

                <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-1">
                  Upload PDF to View
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm mb-5">
                  Drag and drop your PDF document here, or browse files directly from your computer.
                </p>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl transition-all shadow-xs hover:shadow-md focus:outline-hidden focus:ring-2 focus:ring-blue-500/40"
                >
                  Browse PDF Files
                </button>

                <div className="flex items-center gap-4 mt-6 text-2xs text-slate-400">
                  <span>Up to 100 MB</span>
                  <span>•</span>
                  <span>100% Private (Runs locally in your browser)</span>
                </div>
              </div>

              {/* Supported Features Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 text-left">
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                  <div className="text-blue-600 font-semibold text-xs mb-0.5">High Fidelity</div>
                  <div className="text-2xs text-slate-500">Vector text and sharp high-DPI canvas rendering</div>
                </div>
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                  <div className="text-blue-600 font-semibold text-xs mb-0.5">Smart Zoom</div>
                  <div className="text-2xs text-slate-500">Fit to width, fit to page, and 50%–250% zoom</div>
                </div>
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                  <div className="text-blue-600 font-semibold text-xs mb-0.5">Direct Jump</div>
                  <div className="text-2xs text-slate-500">Rapid numeric page navigation & shortcuts</div>
                </div>
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                  <div className="text-blue-600 font-semibold text-xs mb-0.5">Fullscreen</div>
                  <div className="text-2xs text-slate-500">Distraction-free reading experience</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── State 2: Document Loaded & Interactive Viewer ────────────────── */}
        {file && (
          <div className="flex-1 flex flex-col min-w-0 bg-slate-100/70">
            {/* ── Document Control Toolbar ─────────────────────────────────── */}
            <div className="sticky top-16 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
              {/* Left Group: File Info & Thumbnail Toggle */}
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setShowThumbnails((prev) => !prev)}
                  className={`p-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    showThumbnails
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                  title="Toggle thumbnail navigation panel"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                </button>

                <div className="min-w-0 max-w-[140px] xs:max-w-[180px] sm:max-w-[260px]">
                  <p className="text-xs font-semibold text-slate-800 truncate" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-2xs text-slate-400">
                    {formatBytes(file.size)} • {numPages} {numPages === 1 ? "page" : "pages"}
                  </p>
                </div>
              </div>

              {/* Center Group: Page Navigation & Direct Jump */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={prevPage}
                  disabled={currentPage <= 1 || isRenderingPage}
                  className="p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100 rounded-lg transition-colors"
                  title="Previous page (Left arrow)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>

                {/* Page Jump Input */}
                <div className="flex items-center gap-1 text-xs text-slate-600">
                  <span className="hidden sm:inline">Page</span>
                  <input
                    type="number"
                    min="1"
                    max={numPages || 1}
                    value={pageInputVal}
                    onChange={(e) => setPageInputVal(e.target.value)}
                    onKeyDown={handlePageInputKeyDown}
                    onBlur={() => goToPage(pageInputVal)}
                    className="w-11 sm:w-13 text-center px-1 py-1 font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 text-xs"
                    title="Enter page number and press Enter"
                  />
                  <span>of {numPages || 1}</span>
                </div>

                <button
                  type="button"
                  onClick={nextPage}
                  disabled={currentPage >= numPages || isRenderingPage}
                  className="p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100 rounded-lg transition-colors"
                  title="Next page (Right arrow)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              </div>

              {/* Right Group: Zoom Controls, Fit Modes & Fullscreen */}
              <div className="flex items-center gap-1 sm:gap-1.5">
                {/* Zoom Out */}
                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={scale <= MIN_ZOOM || isRenderingPage}
                  className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors"
                  title="Zoom out (-)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                  </svg>
                </button>

                {/* Current Zoom Percentage Button (Click to reset to 100%) */}
                <button
                  type="button"
                  onClick={resetZoom}
                  className="px-2 py-1 text-xs font-medium text-slate-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Click to reset zoom to 100% (0 key)"
                >
                  {Math.round(scale * 100)}%
                </button>

                {/* Zoom In */}
                <button
                  type="button"
                  onClick={zoomIn}
                  disabled={scale >= MAX_ZOOM || isRenderingPage}
                  className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors"
                  title="Zoom in (+)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>

                <div className="h-4 w-px bg-slate-200 mx-0.5 hidden xs:block" />

                {/* Fit Width */}
                <button
                  type="button"
                  onClick={handleFitWidth}
                  className={`hidden xs:inline-flex items-center gap-1 px-2 py-1 text-2xs font-medium rounded-lg border transition-colors ${
                    fitMode === "width"
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                  title="Fit document width to screen"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  </svg>
                  <span>Width</span>
                </button>

                {/* Fit Page */}
                <button
                  type="button"
                  onClick={handleFitPage}
                  className={`hidden sm:inline-flex items-center gap-1 px-2 py-1 text-2xs font-medium rounded-lg border transition-colors ${
                    fitMode === "page"
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                  title="Fit whole page into window"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.5-15h15a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0119.5 19.5h-15A2.25 2.25 0 012.25 17.25V6.75A2.25 2.25 0 014.5 4.5z" />
                  </svg>
                  <span>Page</span>
                </button>

                {/* Fullscreen Toggle */}
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors ml-0.5"
                  title={isFullscreen ? "Exit Fullscreen (Esc)" : "Enter Fullscreen (F)"}
                >
                  {isFullscreen ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* ── Document Viewport Body ───────────────────────────────────── */}
            <div className="flex-1 flex min-h-0 relative">
              {/* Optional Sidebar: Quick Thumbnails / Page List */}
              {showThumbnails && (
                <aside className="w-48 sm:w-56 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto p-3 gap-2 shadow-inner">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-semibold text-slate-700">Pages ({numPages})</span>
                    <button
                      type="button"
                      onClick={() => setShowThumbnails(false)}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {Array.from({ length: numPages }, (_, idx) => idx + 1).map((pg) => (
                      <button
                        key={pg}
                        type="button"
                        onClick={() => goToPage(pg)}
                        className={`w-full py-2 px-3 text-left rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                          pg === currentPage
                            ? "bg-blue-600 text-white shadow-xs"
                            : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <span>Page {pg}</span>
                        {pg === currentPage && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </aside>
              )}

              {/* Central PDF Canvas Display Area */}
              <div
                ref={viewerContainerRef}
                className="flex-1 overflow-auto flex items-center justify-center p-4 sm:p-8 min-h-[500px] relative bg-slate-200/60"
              >
                {/* Document Loading Overlay */}
                {isLoadingDoc && (
                  <div className="absolute inset-0 z-30 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center gap-3">
                    <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs sm:text-sm font-semibold text-slate-700">
                      Loading document...
                    </p>
                  </div>
                )}

                {/* Page Re-rendering Spinner */}
                {isRenderingPage && !isLoadingDoc && (
                  <div className="absolute top-4 right-4 z-20 bg-white/90 backdrop-blur-xs px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-xs flex items-center gap-2 text-2xs font-medium text-slate-600">
                    <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span>Rendering...</span>
                  </div>
                )}

                {/* PDF Page Canvas */}
                <div className="relative inline-block shadow-xl rounded-sm transition-transform duration-100 ease-out">
                  <canvas ref={canvasRef} className="block rounded-xs bg-white" />
                </div>
              </div>
            </div>

            {/* ── Viewport Status & Keyboard Shortcut Hints ─────────────────── */}
            <footer className="bg-white border-t border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-2xs text-slate-500">
              <div className="flex items-center gap-3">
                <span>
                  Viewing Page <strong className="text-slate-700 font-semibold">{currentPage}</strong> of{" "}
                  <strong className="text-slate-700 font-semibold">{numPages}</strong>
                </span>
                <span>•</span>
                <span>
                  Scale: <strong className="text-slate-700 font-semibold">{Math.round(scale * 100)}%</strong>
                  {fitMode !== "custom" && ` (${fitMode})`}
                </span>
              </div>

              <div className="hidden md:flex items-center gap-3 text-slate-400">
                <span>Shortcuts:</span>
                <span><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600">←</kbd> <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600">→</kbd> Pages</span>
                <span><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600">+</kbd> <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600">-</kbd> Zoom</span>
                <span><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600">F</kbd> Fullscreen</span>
              </div>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
}