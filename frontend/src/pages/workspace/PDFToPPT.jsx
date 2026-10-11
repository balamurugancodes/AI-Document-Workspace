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

// ── Resilient Dynamic PDF.js Loader & Worker Setup ────────────────────────────
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

// ── Resilient Dynamic PptxGenJS Loader ────────────────────────────────────────
let PptxGenJSInstance = null;
async function loadPptxGenJS() {
  if (PptxGenJSInstance) return PptxGenJSInstance;
  if (typeof window !== "undefined" && window.PptxGenJS) {
    PptxGenJSInstance = window.PptxGenJS;
    return PptxGenJSInstance;
  }

  // Attempt dynamic import of locally installed package without breaking Vite build
  try {
    const mod = await import(/* @vite-ignore */ "pptxgenjs");
    if (mod) {
      PptxGenJSInstance = mod.default || mod;
      return PptxGenJSInstance;
    }
  } catch {
    // Package not yet installed locally
  }

  // In-browser CDN fallback
  if (typeof window !== "undefined") {
    if (!window.__pptxgenPromise) {
      window.__pptxgenPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js";
        script.async = true;
        script.onload = () => {
          if (window.PptxGenJS) {
            resolve(window.PptxGenJS);
          } else {
            reject(new Error("window.PptxGenJS not found"));
          }
        };
        script.onerror = () => reject(new Error("pptxgenjs library is not available."));
        document.head.appendChild(script);
      });
    }
    try {
      PptxGenJSInstance = await window.__pptxgenPromise;
      return PptxGenJSInstance;
    } catch {
      return null;
    }
  }

  return null;
}

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

// ── Slide Layout Presets ──────────────────────────────────────────────────────
const SLIDE_LAYOUTS = [
  {
    id: "16x9",
    name: "Widescreen (16:9)",
    desc: "Standard for modern displays, projectors, and video calls.",
    widthInches: 10,
    heightInches: 5.625,
    layoutCode: "LAYOUT_16x9",
  },
  {
    id: "4x3",
    name: "Standard (4:3)",
    desc: "Traditional presentation format, tablets, and printed handouts.",
    widthInches: 10,
    heightInches: 7.5,
    layoutCode: "LAYOUT_4x3",
  },
];

export default function PDFToPPT() {
  const location = useLocation();
  const navigate = useNavigate();

  // Document State
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [renderingPreview, setRenderingPreview] = useState(false);
  const [docError, setDocError] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Conversion Settings State
  const [pageScope, setPageScope] = useState("all"); // 'all' | 'current' | 'custom'
  const [customRange, setCustomRange] = useState("");
  const [slideLayoutId, setSlideLayoutId] = useState("16x9");

  // Conversion Execution & Output State
  const [converting, setConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [convertStep, setConvertStep] = useState("");
  const [convertError, setConvertError] = useState(null);
  const [convertedPPTX, setConvertedPPTX] = useState(null); // { blob, objectUrl, filename, sizeBytes, slideCount }
  const [pptxAvailable, setPptxAvailable] = useState(false);
  const [missingDependencyNotice, setMissingDependencyNotice] = useState(false);

  // References
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const pdfDocRef = useRef(null);
  const isAbortedRef = useRef(false);
  const createdUrlsRef = useRef([]);

  // Check pptxgenjs availability on mount
  useEffect(() => {
    loadPptxGenJS().then((lib) => {
      if (lib) {
        setPptxAvailable(true);
      } else {
        setPptxAvailable(false);
      }
    });
  }, []);

  // Cleanup helper for object URLs
  const cleanupObjectUrls = useCallback(() => {
    createdUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    createdUrlsRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupObjectUrls();
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
      if (pdfDocRef.current) {
        try {
          pdfDocRef.current.destroy();
        } catch {}
      }
    };
  }, [cleanupObjectUrls]);

  // ── Document Loader ─────────────────────────────────────────────────────────
  const loadPDFDocument = useCallback(
    async (fileObj) => {
      setLoadingDoc(true);
      setDocError(null);
      setConvertError(null);
      setConvertedPPTX(null);
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

        if (pdfDocRef.current) {
          try {
            await pdfDocRef.current.destroy();
          } catch {}
        }

        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(buffer),
          cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;
        pdfDocRef.current = doc;

        setFile(fileObj);
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
        setNumPages(0);
      } finally {
        setLoadingDoc(false);
      }
    },
    [cleanupObjectUrls]
  );

  // Forwarded file support from Dashboard
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
      } catch {}
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
      } catch {}
    }
    if (pdfDocRef.current) {
      try {
        pdfDocRef.current.destroy();
      } catch {}
    }
    pdfDocRef.current = null;
    setFile(null);
    setNumPages(0);
    setCurrentPage(1);
    setConvertedPPTX(null);
    setDocError(null);
    setConvertError(null);
    setMissingDependencyNotice(false);
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

  const selectedLayout = useMemo(() => {
    return SLIDE_LAYOUTS.find((l) => l.id === slideLayoutId) || SLIDE_LAYOUTS[0];
  }, [slideLayoutId]);

  // ── PDF to PowerPoint Conversion Engine ─────────────────────────────────────
  const handleConvertToPPTX = async () => {
    if (!pdfDocRef.current || resolvedTargetPages.length === 0 || converting) return;

    // Check pptxgenjs library availability
    const PptxGen = await loadPptxGenJS();
    if (!PptxGen) {
      setMissingDependencyNotice(true);
      return;
    }

    setConverting(true);
    setConvertError(null);
    setConvertedPPTX(null);
    setMissingDependencyNotice(false);
    cleanupObjectUrls();
    isAbortedRef.current = false;

    const total = resolvedTargetPages.length;
    setConvertProgress({ current: 0, total, percent: 0 });
    setConvertStep("Initializing PowerPoint presentation...");

    const baseName = file?.name?.replace(/\.[^/.]+$/, "") || "presentation";

    try {
      const pptx = new PptxGen();
      pptx.layout = selectedLayout.layoutCode;

      const slideW = selectedLayout.widthInches;
      const slideH = selectedLayout.heightInches;
      const slideRatio = slideW / slideH;

      for (let i = 0; i < total; i++) {
        if (isAbortedRef.current) {
          throw new Error("Conversion was canceled by user.");
        }

        const pageNum = resolvedTargetPages[i];
        setConvertProgress({
          current: i + 1,
          total,
          percent: Math.round(((i + 1) / total) * 90),
        });
        setConvertStep(`Rasterizing and placing Page ${pageNum} on slide ${i + 1}...`);

        const page = await pdfDocRef.current.getPage(pageNum);

        // Render page at sharp 1.5x scale factor (150 DPI equivalent)
        const viewport = page.getViewport({ scale: 1.5 });

        const offscreenCanvas = document.createElement("canvas");
        offscreenCanvas.width = Math.floor(viewport.width);
        offscreenCanvas.height = Math.floor(viewport.height);

        const ctx = offscreenCanvas.getContext("2d", { alpha: false });
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;

        // Convert rasterized page to JPEG data URL
        const dataUrl = offscreenCanvas.toDataURL("image/jpeg", 0.9);

        // Calculate aspect ratio fit so PDF page does not stretch
        const pageRatio = offscreenCanvas.width / offscreenCanvas.height;
        let imgW, imgH, imgX, imgY;

        if (pageRatio > slideRatio) {
          // Page is wider than slide ratio -> fit width
          imgW = slideW;
          imgH = slideW / pageRatio;
          imgX = 0;
          imgY = (slideH - imgH) / 2;
        } else {
          // Page is taller than slide ratio -> fit height
          imgH = slideH;
          imgW = slideH * pageRatio;
          imgX = (slideW - imgW) / 2;
          imgY = 0;
        }

        const slide = pptx.addSlide();
        slide.background = { color: "FFFFFF" };

        slide.addImage({
          data: dataUrl,
          x: imgX,
          y: imgY,
          w: imgW,
          h: imgH,
        });
      }

      setConvertStep("Compiling binary PPTX package...");
      setConvertProgress({ current: total, total, percent: 96 });

      // Generate binary Blob
      const pptxBlob = await pptx.write({ outputType: "blob" });
      const objectUrl = URL.createObjectURL(pptxBlob);
      createdUrlsRef.current.push(objectUrl);

      setConvertProgress({ current: total, total, percent: 100 });
      setConvertedPPTX({
        blob: pptxBlob,
        objectUrl,
        filename: `${baseName}.pptx`,
        sizeBytes: pptxBlob.size,
        slideCount: total,
      });
    } catch (err) {
      if (err.message !== "Conversion was canceled by user.") {
        console.error("PPTX conversion failed:", err);
        setConvertError(err.message || "An unexpected error occurred during PowerPoint conversion.");
      }
    } finally {
      setConverting(false);
      setConvertStep("");
    }
  };

  const handleCancelConversion = () => {
    isAbortedRef.current = true;
    setConverting(false);
  };

  // ── Download Helper ─────────────────────────────────────────────────────────
  const handleDownloadPPTX = () => {
    if (!convertedPPTX) return;
    const link = document.createElement("a");
    link.href = convertedPPTX.objectUrl;
    link.download = convertedPPTX.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 antialiased selection:bg-orange-100 selection:text-orange-900">
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
            <div className="w-8 h-8 rounded-lg bg-orange-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.25 2.25L15 7.5" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate">
                PDF to PowerPoint
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-500 hidden sm:block truncate">
                Convert PDF documents into PowerPoint presentation slides (.pptx)
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
        {/* Document Error Notification */}
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

        {/* Missing Dependency Notice */}
        {missingDependencyNotice && (
          <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-xs">
            <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div className="flex-1 text-xs sm:text-sm">
              <p className="font-bold text-amber-950">Package Required for PPTX Export</p>
              <p className="mt-1 text-amber-800">
                To compile native OpenXML presentation files (<code className="font-mono bg-amber-100 px-1 py-0.5 rounded">.pptx</code>), install the PowerPoint generator package in your project:
              </p>
              <pre className="mt-2 p-2.5 bg-amber-900 text-amber-100 rounded-lg font-mono text-xs overflow-x-auto">
                npm install pptxgenjs
              </pre>
            </div>
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
                  ? "border-orange-500 bg-orange-50/50 scale-[1.01]"
                  : "border-slate-300 hover:border-orange-400 hover:bg-slate-50/60"
              }`}
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mb-5 shadow-inner">
                <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.25 2.25L15 7.5" />
                </svg>
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
                Upload a PDF to Convert to PowerPoint
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-6">
                Drag and drop your PDF here, or browse files from your computer. Pages are rendered proportionally into clean PowerPoint slides.
              </p>

              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm shadow-md transition-all active:scale-[0.98]">
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
                  16:9 & 4:3 slide geometry
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Up to 100 MB
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── LOADED STATE: Two-Column Workspace ───────────────────────────── */}
        {file && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ── LEFT COLUMN: PDF Preview & Info (5 cols on Desktop) ──────── */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* Document Overview Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate max-w-xs" title={file.name}>
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
                </div>
              </div>

              {/* PDF Preview Canvas Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">Slide Preview</span>
                  {numPages > 0 && (
                    <span>
                      Page {currentPage} of {numPages}
                    </span>
                  )}
                </div>

                <div className="relative min-h-[340px] max-h-[500px] bg-slate-100/70 rounded-xl overflow-auto p-4 flex items-center justify-center border border-slate-200/60 my-3">
                  {renderingPreview && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-2xs flex flex-col items-center justify-center z-10">
                      <div className="w-8 h-8 border-3 border-orange-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs font-medium text-slate-600 mt-2">Rendering Slide...</span>
                    </div>
                  )}

                  <canvas
                    ref={canvasRef}
                    className="shadow-md rounded-sm max-w-full bg-white transition-transform"
                    style={{ display: numPages > 0 ? "block" : "none" }}
                  />
                </div>

                {/* Page Navigation */}
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
                          Slide {p}
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

            {/* ── RIGHT COLUMN: Presentation Settings & Actions (7 cols) ─── */}
            <div className="lg:col-span-7 flex flex-col gap-5">
              {/* Settings Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-slate-500 mb-4">
                  Presentation Settings
                </h3>

                {/* 1. Slide Geometry Layout */}
                <div className="mb-5">
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Slide Dimensions & Aspect Ratio
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {SLIDE_LAYOUTS.map((layout) => {
                      const isSelected = slideLayoutId === layout.id;
                      return (
                        <div
                          key={layout.id}
                          onClick={() => !converting && setSlideLayoutId(layout.id)}
                          className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                            isSelected
                              ? "border-orange-500 bg-orange-50/40 shadow-2xs"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">{layout.name}</span>
                            {isSelected && (
                              <span className="w-2 h-2 rounded-full bg-orange-600 inline-block" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                            {layout.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Target Pages Scope */}
                <div className="mb-5">
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Slides to Include
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPageScope("all")}
                      disabled={converting}
                      className={`py-2 px-2.5 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                        pageScope === "all"
                          ? "bg-orange-50 border-orange-500 text-orange-700 shadow-2xs"
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
                          ? "bg-orange-50 border-orange-500 text-orange-700 shadow-2xs"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Slide {currentPage} Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setPageScope("custom")}
                      disabled={converting}
                      className={`py-2 px-2.5 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                        pageScope === "custom"
                          ? "bg-orange-50 border-orange-500 text-orange-700 shadow-2xs"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Custom Range
                    </button>
                  </div>

                  {/* Custom Range Input */}
                  {pageScope === "custom" && (
                    <div className="mt-3">
                      <input
                        type="text"
                        value={customRange}
                        onChange={(e) => setCustomRange(e.target.value)}
                        placeholder="e.g. 1-3, 5"
                        disabled={converting}
                        className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-mono transition-all ${
                          isCustomRangeInvalid
                            ? "border-red-400 bg-red-50/30 text-red-900 focus:ring-2 focus:ring-red-200"
                            : "border-slate-300 bg-white text-slate-800 focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                        }`}
                      />
                      <div className="flex items-center justify-between mt-1.5 text-[11px]">
                        <span className="text-slate-400">Example syntax: 1-3, 5</span>
                        {isCustomRangeInvalid ? (
                          <span className="text-red-600 font-semibold">Invalid range syntax</span>
                        ) : (
                          <span className="text-orange-600 font-medium">
                            {resolvedTargetPages.length} {resolvedTargetPages.length === 1 ? "slide" : "slides"} selected
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {pageScope !== "custom" && (
                    <p className="mt-2 text-[11px] text-slate-500">
                      Targeting: <strong className="text-slate-700">{resolvedTargetPages.length}</strong> {resolvedTargetPages.length === 1 ? "slide" : "slides"} for export.
                    </p>
                  )}
                </div>

                {/* 3. Conversion Limitations Notice */}
                <div className="mb-6 p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] text-slate-500 leading-relaxed">
                  <strong className="text-slate-700">Conversion Note:</strong> Each PDF page is rasterized at high resolution and placed centered on its slide with preserved aspect ratio. Individual vector shapes or embedded paragraphs are not converted into editable PowerPoint text boxes in this version.
                </div>

                {/* 4. Action Button */}
                <div>
                  {!converting ? (
                    <button
                      type="button"
                      onClick={handleConvertToPPTX}
                      disabled={resolvedTargetPages.length === 0 || isCustomRangeInvalid}
                      className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.25 2.25L15 7.5" />
                      </svg>
                      <span>
                        Convert {resolvedTargetPages.length} {resolvedTargetPages.length === 1 ? "Slide" : "Slides"} to PowerPoint
                      </span>
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-orange-700 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-orange-600 animate-ping inline-block" />
                          {convertStep || `Processing slide ${convertProgress.current} of ${convertProgress.total}...`}
                        </span>
                        <span className="font-bold text-slate-700">{convertProgress.percent}%</span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/80">
                        <div
                          className="h-full bg-orange-600 rounded-full transition-all duration-300"
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
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                      <p className="font-semibold text-red-800">Conversion Failed</p>
                      <p className="mt-0.5">{convertError}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Converted PPTX Download Card */}
              {convertedPPTX && (
                <div className="bg-white rounded-2xl border border-emerald-200/80 p-5 shadow-xs bg-emerald-50/20">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 truncate">
                        {convertedPPTX.filename}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {formatBytes(convertedPPTX.sizeBytes)} &bull; {convertedPPTX.slideCount} {convertedPPTX.slideCount === 1 ? "slide" : "slides"}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadPPTX}
                    className="w-full min-h-[44px] mt-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl text-xs font-semibold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download PowerPoint (.pptx)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}