import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PDFDocument, degrees } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Configure PDF.js worker cleanly for Vite
if (typeof window !== "undefined" && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    pdfWorkerUrl ||
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

// ── File Size Formatter ───────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ── Normalize Angle to 0, 90, 180, 270 ────────────────────────────────────────
function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

export default function RotatePDF() {
  const navigate = useNavigate();

  // ── Core File & Document State ────────────────────────────────────────────
  const [file, setFile] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1); // 1-indexed
  const [isDragging, setIsDragging] = useState(false);

  // ── Rotation State ────────────────────────────────────────────────────────
  // pageRotations stores additional rotation (0, 90, 180, 270) per 1-indexed page
  const [pageRotations, setPageRotations] = useState({});
  const [rotationScope, setRotationScope] = useState("all"); // "all" | "current"

  // ── Processing & Feedback State ───────────────────────────────────────────
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isRenderingPreview, setIsRenderingPreview] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [previewAvailable, setPreviewAvailable] = useState(false);

  // Structured error: { title: string, message: string } | null
  const [errorBanner, setErrorBanner] = useState(null);

  // Output result: { url, fileName, sizeBytes, rotatedCount, totalPages } | null
  const [rotatedResult, setRotatedResult] = useState(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const pdfJsDocRef = useRef(null);
  const pdfBytesRef = useRef(null);
  const renderTaskRef = useRef(null);

  // Cleanup Blob URL and PDF.js document on unmount
  useEffect(() => {
    return () => {
      if (rotatedResult?.url) {
        URL.revokeObjectURL(rotatedResult.url);
      }
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
      if (pdfJsDocRef.current) {
        try {
          pdfJsDocRef.current.destroy();
        } catch {
          // ignore
        }
      }
    };
  }, [rotatedResult]);

  // Clear output download whenever user changes rotation settings
  const invalidateOutputResult = useCallback(() => {
    setRotatedResult((prev) => {
      if (prev?.url) {
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
  }, []);

  // ── Render Current Page Preview on Canvas (if PDF.js is available) ────────
  const renderPagePreview = useCallback(async (pageNum) => {
    const pdfDoc = pdfJsDocRef.current;
    const canvas = canvasRef.current;
    if (!pdfDoc || !canvas) return;

    // Cancel any in-flight render task before starting a new one
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // ignore
      }
      renderTaskRef.current = null;
    }

    setIsRenderingPreview(true);
    try {
      const page = await pdfDoc.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });

      // Calculate crisp scale to fit comfortably within preview box
      const targetMaxWidth = 420;
      const scale = Math.min(1.6, targetMaxWidth / (baseViewport.width || 600));
      const viewport = page.getViewport({ scale });

      const context = canvas.getContext("2d");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      // Fill clean white paper background before rendering PDF content
      context.save();
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();

      const renderTask = page.render({
        canvasContext: context,
        viewport,
      });
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      renderTaskRef.current = null;
      setPreviewAvailable(true);
    } catch (err) {
      if (err?.name === "RenderingCancelledException") {
        return;
      }
      console.warn("RotatePDF preview render fallback:", err);
      setPreviewAvailable(false);
    } finally {
      setIsRenderingPreview(false);
    }
  }, []);

  // Re-render preview when file finishes loading or currentPage changes
  useEffect(() => {
    if (
      file &&
      !isReadingFile &&
      pdfJsDocRef.current &&
      currentPage >= 1 &&
      currentPage <= pageCount
    ) {
      renderPagePreview(currentPage);
    }
  }, [file, isReadingFile, currentPage, pageCount, renderPagePreview]);

  // ── Validate and Load Selected PDF File ───────────────────────────────────
  const handleSelectFile = async (selectedFile) => {
    if (!selectedFile) return;

    setErrorBanner(null);
    invalidateOutputResult();

    // 1. Validate PDF extension / MIME type leniently (handles empty OS MIME types)
    const fileName = (selectedFile.name || "").trim();
    const isPdfMime =
      selectedFile.type === "application/pdf" ||
      selectedFile.type === "application/x-pdf";
    const isPdfExt = fileName.toLowerCase().endsWith(".pdf");

    if (!isPdfMime && !isPdfExt) {
      setErrorBanner({
        title: "Invalid File Format",
        message: `"${fileName || "Selected file"}" is not a PDF document. Please select a valid .pdf file.`,
      });
      return;
    }

    // 2. Validate non-empty file size
    if (selectedFile.size === 0) {
      setErrorBanner({
        title: "Empty PDF File",
        message: `"${fileName}" is 0 bytes and contains no readable PDF data.`,
      });
      return;
    }

    setIsReadingFile(true);

    // Clean up any previous PDF.js document instance
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // ignore
      }
      renderTaskRef.current = null;
    }
    if (pdfJsDocRef.current) {
      try {
        pdfJsDocRef.current.destroy();
      } catch {
        // ignore
      }
      pdfJsDocRef.current = null;
    }

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();

      // Verify basic %PDF- header signature within the first 1024 bytes
      const headerCheckBytes = new Uint8Array(
        arrayBuffer.slice(0, Math.min(1024, arrayBuffer.byteLength))
      );
      const headerStr = new TextDecoder("latin1").decode(headerCheckBytes);
      if (!headerStr.includes("%PDF-")) {
        setErrorBanner({
          title: "Damaged or Corrupted PDF",
          message:
            "Unable to read PDF structure. The file does not contain a valid PDF header.",
        });
        setFile(null);
        setPageCount(0);
        setIsReadingFile(false);
        return;
      }

      // Create dedicated Uint8Array copies so Web Workers never detach our buffer
      const pdfLibBytes = new Uint8Array(arrayBuffer.slice(0));
      const pdfJsBytes = new Uint8Array(arrayBuffer.slice(0));

      // Step A: Validate with pdf-lib
      // Using ignoreEncryption: true allows standard PDFs with owner-permission flags
      // to open normally instead of throwing a false encryption error.
      let pdfDoc;
      try {
        pdfDoc = await PDFDocument.load(pdfLibBytes, {
          ignoreEncryption: true,
          updateMetadata: false,
        });
      } catch (loadErr) {
        const msg = (loadErr?.message || "").toLowerCase();
        if (msg.includes("encrypt") || msg.includes("password")) {
          setErrorBanner({
            title: "Password-Protected PDF",
            message: `"${fileName}" is locked with a password. Please unlock the PDF before rotating it.`,
          });
        } else {
          setErrorBanner({
            title: "Damaged or Corrupted PDF",
            message:
              "Unable to read PDF structure. The file may be damaged or incomplete.",
          });
        }
        setFile(null);
        setPageCount(0);
        setIsReadingFile(false);
        return;
      }

      const totalPages = pdfDoc.getPageCount();
      if (!totalPages || totalPages < 1) {
        setErrorBanner({
          title: "No Pages Found",
          message: `"${fileName}" does not contain any readable pages to rotate.`,
        });
        setFile(null);
        setPageCount(0);
        setIsReadingFile(false);
        return;
      }

      // Store clean bytes for fast, reliable rotation later
      pdfBytesRef.current = pdfLibBytes;

      // Initialize per-page rotation state to 0° for all pages
      const initialRotations = {};
      for (let i = 1; i <= totalPages; i++) {
        initialRotations[i] = 0;
      }

      // Step B: Optionally load PDF.js for visual page preview
      // Isolated in its own try/catch so preview issues NEVER reject a valid PDF!
      let previewLoaded = false;
      try {
        const loadingTask = pdfjsLib.getDocument({
          data: pdfJsBytes,
        });
        const loadedPdfJs = await loadingTask.promise;
        pdfJsDocRef.current = loadedPdfJs;
        previewLoaded = true;
      } catch (previewErr) {
        console.warn(
          "PDF.js visual preview unavailable, using schematic page card:",
          previewErr
        );
        pdfJsDocRef.current = null;
        previewLoaded = false;
      }

      setFile(selectedFile);
      setPageCount(totalPages);
      setCurrentPage(1);
      setPageRotations(initialRotations);
      setRotationScope("all");
      setPreviewAvailable(previewLoaded);
    } catch (err) {
      console.error("Error reading PDF file:", err);
      setErrorBanner({
        title: "Damaged or Corrupted PDF",
        message:
          "Unable to read the selected PDF file. Please try uploading the file again.",
      });
      setFile(null);
      setPageCount(0);
    } finally {
      setIsReadingFile(false);
    }
  };

  // ── File Input & Drag-and-Drop Handlers ───────────────────────────────────
  const handleFileInputChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      handleSelectFile(selected);
    }
    e.target.value = "";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
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

    const droppedFiles = Array.from(e.dataTransfer?.files || []);
    if (droppedFiles.length === 0) return;

    if (droppedFiles.length > 1) {
      setErrorBanner({
        title: "Single PDF Only",
        message:
          "Rotate PDF processes one document at a time. Loading the first dropped file.",
      });
    }

    handleSelectFile(droppedFiles[0]);
  };

  // ── Rotation Angle Controls ───────────────────────────────────────────────
  const handleRotate = (deltaDegrees) => {
    if (!file || pageCount < 1) return;
    setErrorBanner(null);
    invalidateOutputResult();

    setPageRotations((prev) => {
      const updated = { ...prev };
      if (rotationScope === "all") {
        for (let i = 1; i <= pageCount; i++) {
          updated[i] = normalizeAngle((updated[i] || 0) + deltaDegrees);
        }
      } else {
        updated[currentPage] = normalizeAngle(
          (updated[currentPage] || 0) + deltaDegrees
        );
      }
      return updated;
    });
  };

  const handleResetCurrentPage = () => {
    if (!file) return;
    invalidateOutputResult();
    setPageRotations((prev) => ({
      ...prev,
      [currentPage]: 0,
    }));
  };

  const handleResetAllPages = () => {
    if (!file) return;
    invalidateOutputResult();
    const resetMap = {};
    for (let i = 1; i <= pageCount; i++) {
      resetMap[i] = 0;
    }
    setPageRotations(resetMap);
  };

  const handleClearFile = () => {
    invalidateOutputResult();
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // ignore
      }
      renderTaskRef.current = null;
    }
    if (pdfJsDocRef.current) {
      try {
        pdfJsDocRef.current.destroy();
      } catch {
        // ignore
      }
      pdfJsDocRef.current = null;
    }
    pdfBytesRef.current = null;
    setFile(null);
    setPageCount(0);
    setCurrentPage(1);
    setPageRotations({});
    setErrorBanner(null);
    setPreviewAvailable(false);
  };

  // ── Apply Rotation & Generate Output PDF ──────────────────────────────────
  const handleApplyRotation = async () => {
    if (!file || pageCount < 1) {
      setErrorBanner({
        title: "No PDF Selected",
        message: "Please upload a PDF file first before applying rotation.",
      });
      return;
    }

    setIsRotating(true);
    setErrorBanner(null);
    invalidateOutputResult();

    try {
      const sourceBytes =
        pdfBytesRef.current || new Uint8Array(await file.arrayBuffer());

      const pdfDoc = await PDFDocument.load(sourceBytes, {
        ignoreEncryption: true,
      });

      const pages = pdfDoc.getPages();
      let rotatedPagesCount = 0;

      pages.forEach((page, idx) => {
        const pageNum = idx + 1;
        const addedAngle = normalizeAngle(pageRotations[pageNum] || 0);
        if (addedAngle !== 0) {
          const existingAngle = page.getRotation().angle || 0;
          const newTotalAngle = normalizeAngle(existingAngle + addedAngle);
          page.setRotation(degrees(newTotalAngle));
          rotatedPagesCount += 1;
        }
      });

      const rotatedPdfBytes = await pdfDoc.save();
      const blob = new Blob([rotatedPdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      const baseName = file.name.replace(/\.pdf$/i, "");
      const outputFileName = `${baseName}-rotated.pdf`;

      setRotatedResult({
        url,
        fileName: outputFileName,
        sizeBytes: blob.size,
        rotatedCount: rotatedPagesCount,
        totalPages: pages.length,
      });
    } catch (err) {
      console.error("Failed to rotate PDF:", err);
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes("encrypt") || msg.includes("password")) {
        setErrorBanner({
          title: "Encrypted PDF Restricted",
          message:
            "This PDF has security restrictions that prevent modifying its page orientation.",
        });
      } else {
        setErrorBanner({
          title: "Rotation Failed",
          message:
            err?.message ||
            "An unexpected error occurred while generating the rotated PDF. Please try again.",
        });
      }
    } finally {
      setIsRotating(false);
    }
  };

  // ── Trigger Browser Download ──────────────────────────────────────────────
  const handleDownloadRotatedPDF = () => {
    if (!rotatedResult?.url) return;
    const link = document.createElement("a");
    link.href = rotatedResult.url;
    link.download = rotatedResult.fileName || "rotated-document.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Derived Values ────────────────────────────────────────────────────────
  const currentRotationAngle = normalizeAngle(pageRotations[currentPage] || 0);
  const modifiedPagesCount = Object.values(pageRotations).filter(
    (angle) => normalizeAngle(angle) !== 0
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* ── Sticky Workspace Header ────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200/80 hover:text-slate-900 transition-colors shrink-0"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            <span>Back to Dashboard</span>
          </button>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
            </div>
            <div className="truncate">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Rotate PDF
              </h1>
              <p className="text-[11px] text-slate-500 hidden sm:block truncate">
                Rotate single pages or entire PDF documents 90° clockwise or
                counterclockwise
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            100% Client-Side Processing
          </span>
        </div>
      </header>

      {/* ── Main Content Container ─────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* ── Intro Banner ─────────────────────────────────────────────────── */}
        <section className="rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 p-5 sm:p-6 text-white shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 text-[11px] font-semibold tracking-wide uppercase">
                PDF Orientation Tool
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                Fix upside-down or sideways PDF pages in seconds
              </h2>
              <p className="text-xs sm:text-sm text-indigo-100 max-w-2xl">
                Upload a PDF, preview your pages live, rotate either the current
                page or all pages at once, and download your updated file
                instantly.
              </p>
            </div>

            {file && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="self-start sm:self-center inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold backdrop-blur-sm border border-white/20 transition-all shrink-0"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                Choose Another PDF
              </button>
            )}
          </div>
        </section>

        {/* ── Structured Error Alert Banner ────────────────────────────────── */}
        {errorBanner && (
          <div
            role="alert"
            className="rounded-2xl bg-rose-50 border border-rose-200 p-4 flex items-start justify-between gap-3 shadow-xs"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-rose-900">
                  {errorBanner.title}
                </h3>
                <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">
                  {errorBanner.message}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-100 transition-colors shrink-0"
              aria-label="Dismiss error"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* ── Step 1: Upload / Drag & Drop Zone (when no file loaded) ──────── */}
        {!file && (
          <section
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isReadingFile && fileInputRef.current?.click()}
            className={`rounded-2xl border-2 border-dashed transition-all duration-200 p-8 sm:p-12 text-center cursor-pointer bg-white shadow-xs ${
              isDragging
                ? "border-indigo-500 bg-indigo-50/60 scale-[0.995]"
                : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50/70"
            }`}
          >
            <div className="max-w-md mx-auto flex flex-col items-center">
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
                  isDragging
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                    : "bg-indigo-50 text-indigo-600"
                }`}
              >
                {isReadingFile ? (
                  <div className="w-7 h-7 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                ) : (
                  <svg
                    className="w-8 h-8"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.75}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                    />
                  </svg>
                )}
              </div>

              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                {isReadingFile
                  ? "Reading & validating PDF..."
                  : isDragging
                    ? "Drop your PDF file here"
                    : "Select or drag & drop a PDF file"}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1.5">
                Supports standard single-page and multi-page{" "}
                <span className="font-semibold text-slate-700">.pdf</span>{" "}
                documents.
              </p>

              <button
                type="button"
                disabled={isReadingFile}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-sm shadow-indigo-500/20 transition-all disabled:opacity-50"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
                Select PDF File
              </button>

              <div className="mt-6 pt-5 border-t border-slate-100 w-full flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  90° CW & CCW
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  Single Page or All Pages
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Instant Local Download
                </span>
              </div>
            </div>
          </section>
        )}

        {/* ── Active Workspace (when PDF is loaded) ────────────────────────── */}
        {file && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ── Left Column: Controls & File Details (5 cols on lg) ──────── */}
            <div className="lg:col-span-5 space-y-5">
              {/* File Info Card */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 font-bold text-xs border border-indigo-100">
                      PDF
                    </div>
                    <div className="min-w-0">
                      <h3
                        className="text-sm font-bold text-slate-900 truncate"
                        title={file.name}
                      >
                        {file.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                        <span>{formatBytes(file.size)}</span>
                        <span>•</span>
                        <span className="font-semibold text-indigo-600">
                          {pageCount} {pageCount === 1 ? "Page" : "Pages"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleClearFile}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                    title="Remove file"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    Clear
                  </button>
                </div>

                {/* Rotation Summary Badges */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Modified Pages:</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-semibold ${
                      modifiedPagesCount > 0
                        ? "bg-amber-50 text-amber-700 border border-amber-200/70"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {modifiedPagesCount} of {pageCount} rotated
                  </span>
                </div>
              </div>

              {/* Rotation Controls Card */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Rotation Settings
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Choose whether to rotate all pages or only the page
                    currently shown in the preview.
                  </p>
                </div>

                {/* Scope Selector */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Apply Rotation To
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setRotationScope("all")}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                        rotationScope === "all"
                          ? "bg-white text-indigo-600 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      All Pages ({pageCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRotationScope("current")}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                        rotationScope === "current"
                          ? "bg-white text-indigo-600 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Current Page (P.{currentPage})
                    </button>
                  </div>
                </div>

                {/* 90° CW / CCW Action Buttons */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Direction (90° Increments)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleRotate(-90)}
                      className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 active:bg-indigo-100/60 transition-all group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-slate-100 group-hover:bg-indigo-600 group-hover:text-white text-slate-700 flex items-center justify-center transition-colors">
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.8}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                          />
                        </svg>
                      </div>
                      <div className="text-center">
                        <span className="block text-xs font-bold text-slate-800 group-hover:text-indigo-700">
                          Rotate Left
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          90° Counterclockwise
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRotate(90)}
                      className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 active:bg-indigo-100/60 transition-all group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-slate-100 group-hover:bg-indigo-600 group-hover:text-white text-slate-700 flex items-center justify-center transition-colors">
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.8}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3"
                          />
                        </svg>
                      </div>
                      <div className="text-center">
                        <span className="block text-xs font-bold text-slate-800 group-hover:text-indigo-700">
                          Rotate Right
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          90° Clockwise
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Reset Orientation Controls */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
                  <button
                    type="button"
                    disabled={currentRotationAngle === 0}
                    onClick={handleResetCurrentPage}
                    className="text-xs font-semibold text-slate-600 hover:text-indigo-600 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    Reset Page {currentPage}
                  </button>

                  <button
                    type="button"
                    disabled={modifiedPagesCount === 0}
                    onClick={handleResetAllPages}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                      />
                    </svg>
                    Reset All Pages
                  </button>
                </div>

                {/* Primary Apply & Generate Button */}
                <button
                  type="button"
                  disabled={isRotating}
                  onClick={handleApplyRotation}
                  className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-sm shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isRotating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Applying Rotation...</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span>Apply Rotation & Prepare Download</span>
                    </>
                  )}
                </button>
              </div>

              {/* ── Output Download Card (When Rotated PDF is Ready) ───────── */}
              {rotatedResult && (
                <div className="bg-emerald-50/90 rounded-2xl border border-emerald-200 p-5 shadow-xs space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs sm:text-sm font-bold text-emerald-950">
                        Rotated PDF Ready!
                      </h4>
                      <p
                        className="text-xs text-emerald-800 truncate mt-0.5 font-medium"
                        title={rotatedResult.fileName}
                      >
                        {rotatedResult.fileName}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-emerald-700">
                        <span>{formatBytes(rotatedResult.sizeBytes)}</span>
                        <span>•</span>
                        <span>
                          {rotatedResult.rotatedCount} of{" "}
                          {rotatedResult.totalPages} page(s) rotated
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadRotatedPDF}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-sm shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                      />
                    </svg>
                    <span>Download Rotated PDF</span>
                  </button>
                </div>
              )}
            </div>

            {/* ── Right Column: Live Page Preview (7 cols on lg) ───────────── */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col">
              {/* Preview Top Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-bold text-slate-900">
                    Page {currentPage} of {pageCount}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      currentRotationAngle !== 0
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {currentRotationAngle === 0
                      ? "0° (Original)"
                      : `+${currentRotationAngle}° Rotated`}
                  </span>
                </div>

                {/* Page Navigation Controls */}
                {pageCount > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() =>
                        setCurrentPage((p) => Math.max(1, p - 1))
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    >
                      Prev
                    </button>
                    <span className="text-xs font-medium text-slate-500 px-2">
                      {currentPage} / {pageCount}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= pageCount}
                      onClick={() =>
                        setCurrentPage((p) => Math.min(pageCount, p + 1))
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>

              {/* Preview Stage */}
              <div className="relative my-4 min-h-[360px] sm:min-h-[440px] rounded-xl bg-slate-100/80 border border-slate-200/60 flex items-center justify-center p-6 overflow-hidden">
                {isRenderingPreview && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
                    <div className="w-7 h-7 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                  </div>
                )}

                {/* Rotatable Visual Container */}
                <div
                  style={{
                    transform: `rotate(${currentRotationAngle}deg)`,
                  }}
                  className="transition-transform duration-300 ease-out flex items-center justify-center"
                >
                  {/* Real PDF.js Canvas Preview */}
                  <canvas
                    ref={canvasRef}
                    className={`max-w-[260px] sm:max-w-[340px] max-h-[320px] sm:max-h-[380px] w-auto h-auto rounded-lg shadow-md bg-white border border-slate-200 ${
                      previewAvailable ? "block" : "hidden"
                    }`}
                  />

                  {/* Fallback Schematic Page Preview if PDF.js is unavailable */}
                  {!previewAvailable && !isRenderingPreview && (
                    <div className="w-52 sm:w-60 h-72 sm:h-80 bg-white rounded-lg shadow-md border border-slate-200 p-5 flex flex-col justify-between select-none">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                          Page {currentPage}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600">
                          TOP
                        </span>
                      </div>

                      <div className="space-y-2.5 my-auto">
                        <div className="h-2.5 bg-slate-200 rounded w-3/4" />
                        <div className="h-2 bg-slate-100 rounded w-full" />
                        <div className="h-2 bg-slate-100 rounded w-5/6" />
                        <div className="h-2 bg-slate-100 rounded w-full" />
                        <div className="h-2 bg-slate-100 rounded w-2/3" />
                      </div>

                      <div className="text-center pt-2.5 border-t border-slate-100">
                        <span className="text-[11px] font-semibold text-slate-400">
                          {currentRotationAngle}° Orientation
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Page Pills Selector (when multi-page) */}
              {pageCount > 1 && (
                <div className="pt-3 border-t border-slate-100">
                  <div className="text-[11px] font-semibold text-slate-500 mb-2">
                    Jump to Page:
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {Array.from({ length: pageCount }, (_, i) => i + 1).map(
                      (pageNum) => {
                        const angle = normalizeAngle(
                          pageRotations[pageNum] || 0
                        );
                        const isSelected = pageNum === currentPage;
                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => setCurrentPage(pageNum)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all flex items-center gap-1 ${
                              isSelected
                                ? "bg-indigo-600 text-white shadow-xs"
                                : angle !== 0
                                  ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            <span>P.{pageNum}</span>
                            {angle !== 0 && (
                              <span
                                className={`text-[10px] ${
                                  isSelected
                                    ? "text-indigo-100"
                                    : "text-indigo-500"
                                }`}
                              >
                                ({angle}°)
                              </span>
                            )}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}