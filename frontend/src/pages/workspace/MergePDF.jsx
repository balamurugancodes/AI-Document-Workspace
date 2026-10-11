import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// ── Dynamic PDFLib Loader (Works with local npm package OR resilient CDN fallback)
let cdnLoadingPromise = null;
async function getPDFDocumentClass() {
  // 1. Check if window.PDFLib is already available
  if (typeof window !== "undefined" && window.PDFLib?.PDFDocument) {
    return window.PDFLib.PDFDocument;
  }

  // 2. Try native module import (if installed via npm)
  try {
    const mod = await import("pdf-lib");
    if (mod?.PDFDocument) return mod.PDFDocument;
  } catch {
    // Fall back to CDN if local module not bundled yet
  }

  // 3. Fallback: dynamically load pdf-lib from CDN
  if (typeof window === "undefined") {
    throw new Error("PDF processing requires a browser environment.");
  }

  if (cdnLoadingPromise) return cdnLoadingPromise;

  cdnLoadingPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("docflow-pdf-lib-script");
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.PDFLib?.PDFDocument) resolve(window.PDFLib.PDFDocument);
        else reject(new Error("PDF library loaded but PDFDocument was not found."));
      });
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load PDF library script."))
      );
      return;
    }

    const script = document.createElement("script");
    script.id = "docflow-pdf-lib-script";
    script.src = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.9/dist/pdf-lib.min.js";
    script.async = true;
    script.onload = () => {
      if (window.PDFLib?.PDFDocument) {
        resolve(window.PDFLib.PDFDocument);
      } else {
        reject(new Error("PDF library loaded but PDFDocument was not initialized."));
      }
    };
    script.onerror = () => {
      reject(
        new Error(
          "Could not load PDF processing library. Please run: npm install pdf-lib"
        )
      );
    };
    document.head.appendChild(script);
  });

  return cdnLoadingPromise;
}

// ── Helper: Format File Size ──────────────────────────────────────────────────
function formatBytes(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ── Actual Client-Side PDF Merging Engine ─────────────────────────────────────
async function executePDFMerge(fileItems, onProgress) {
  if (!fileItems || fileItems.length < 2) {
    throw new Error("At least 2 PDF files are required to perform a merge.");
  }

  onProgress({ percent: 10, message: "Initializing PDF processing engine..." });
  const PDFDocument = await getPDFDocumentClass();

  onProgress({ percent: 20, message: "Creating empty master document..." });
  const masterDoc = await PDFDocument.create();
  let totalPageCount = 0;

  for (let idx = 0; idx < fileItems.length; idx++) {
    const item = fileItems[idx];
    const file = item.file;
    const progressBase = 20 + Math.round((idx / fileItems.length) * 65);

    onProgress({
      percent: progressBase,
      message: `Reading "${file.name}" (${idx + 1} of ${fileItems.length})...`,
    });

    if (file.size === 0) {
      throw new Error(`File "${file.name}" is empty (0 bytes) and cannot be merged.`);
    }

    let arrayBuffer;
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch {
      throw new Error(`Could not read "${file.name}". The file may be locked or moved.`);
    }

    let sourceDoc;
    try {
      sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: false });
    } catch (loadErr) {
      const msg = String(loadErr?.message || "").toLowerCase();
      if (msg.includes("encrypt") || msg.includes("password")) {
        throw new Error(
          `"${file.name}" is password-protected. Please remove encryption before merging.`
        );
      }
      throw new Error(
        `"${file.name}" is corrupted or is not a valid PDF document.`
      );
    }

    const pageIndices = sourceDoc.getPageIndices();
    if (pageIndices.length === 0) {
      throw new Error(`"${file.name}" contains 0 pages and cannot be merged.`);
    }

    onProgress({
      percent: progressBase + Math.round((0.5 / fileItems.length) * 65),
      message: `Copying ${pageIndices.length} page(s) from "${file.name}"...`,
    });

    const copiedPages = await masterDoc.copyPages(sourceDoc, pageIndices);
    copiedPages.forEach((page) => masterDoc.addPage(page));
    totalPageCount += pageIndices.length;
  }

  onProgress({ percent: 90, message: "Generating optimized output document..." });
  const mergedBytes = await masterDoc.save();

  onProgress({ percent: 100, message: "PDF merge complete!" });

  const blob = new Blob([mergedBytes], { type: "application/pdf" });
  return {
    blob,
    bytes: mergedBytes,
    size: mergedBytes.byteLength,
    totalPages: totalPageCount,
  };
}

export default function MergePDF() {
  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // ── State ───────────────────────────────────────────────────────────────────
  const [fileList, setFileList] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, message: "" });
  const [mergeResult, setMergeResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  // ── Pre-populate files if passed from Dashboard router state ────────────────
  useEffect(() => {
    const passed = location.state?.initialFiles;
    if (Array.isArray(passed) && passed.length > 0) {
      const validated = passed
        .filter((f) => f && f.name && f.name.toLowerCase().endsWith(".pdf"))
        .map((f, i) => ({
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          file: f,
          name: f.name,
          size: f.size,
        }));

      if (validated.length > 0) {
        setFileList(validated);
      }
    }
  }, [location.state]);

  // Clean up object URL when component unmounts or new result is generated
  useEffect(() => {
    return () => {
      if (mergeResult?.downloadUrl) {
        URL.revokeObjectURL(mergeResult.downloadUrl);
      }
    };
  }, [mergeResult]);

  // ── Helper: Add Files to Queue ──────────────────────────────────────────────
  const handleAddFiles = (rawFiles) => {
    setErrorMessage("");
    const newItems = [];
    const invalidNames = [];

    Array.from(rawFiles || []).forEach((file) => {
      const lower = (file.name || "").toLowerCase();
      if (!lower.endsWith(".pdf") && file.type !== "application/pdf") {
        invalidNames.push(file.name);
        return;
      }
      newItems.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        name: file.name,
        size: file.size,
      });
    });

    if (invalidNames.length > 0) {
      setErrorMessage(
        `Skipped unsupported file(s): ${invalidNames.join(", ")}. Only PDF files are supported.`
      );
    }

    if (newItems.length > 0) {
      setFileList((prev) => [...prev, ...newItems]);
      if (mergeResult) {
        setMergeResult(null);
      }
    }
  };

  // ── Drag & Drop Handlers ────────────────────────────────────────────────────
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
    if (e.dataTransfer?.files) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  // ── Reorder Files Handlers ──────────────────────────────────────────────────
  const moveFileUp = (index) => {
    if (index <= 0) return;
    setFileList((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const moveFileDown = (index) => {
    setFileList((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  // ── Remove File Handler ─────────────────────────────────────────────────────
  const removeFile = (id) => {
    setFileList((prev) => prev.filter((item) => item.id !== id));
    if (mergeResult) {
      setMergeResult(null);
    }
  };

  // ── Clear All Files ─────────────────────────────────────────────────────────
  const clearAllFiles = () => {
    setFileList([]);
    setMergeResult(null);
    setErrorMessage("");
  };

  // ── Run Merge Action ────────────────────────────────────────────────────────
  const handleMergeSubmit = async () => {
    if (fileList.length < 2) {
      setErrorMessage("Please select at least 2 PDF files to merge.");
      return;
    }

    setErrorMessage("");
    setIsMerging(true);
    setProgress({ percent: 5, message: "Preparing documents..." });

    try {
      const result = await executePDFMerge(fileList, (prog) => {
        setProgress(prog);
      });

      const downloadUrl = URL.createObjectURL(result.blob);
      setMergeResult({
        downloadUrl,
        size: result.size,
        totalPages: result.totalPages,
        filename: `merged-${Date.now().toString().slice(-6)}.pdf`,
      });
    } catch (err) {
      setErrorMessage(
        err?.message || "An unexpected error occurred while merging your PDF documents."
      );
    } finally {
      setIsMerging(false);
    }
  };

  // ── Download Merged File ────────────────────────────────────────────────────
  const triggerDownload = () => {
    if (!mergeResult?.downloadUrl) return;
    const a = document.createElement("a");
    a.href = mergeResult.downloadUrl;
    a.download = mergeResult.filename || "merged-document.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Open Preview in New Tab ─────────────────────────────────────────────────
  const triggerPreview = () => {
    if (!mergeResult?.downloadUrl) return;
    window.open(mergeResult.downloadUrl, "_blank");
  };

  const totalInputSize = fileList.reduce((acc, f) => acc + (f.size || 0), 0);

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 flex flex-col overflow-x-hidden">
      {/* ── Top Header / Navigation Bar (Clean without Homepage link) ───────── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200/90 hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 inline-flex items-center gap-2 transition-colors cursor-pointer shrink-0"
          >
            <svg
              className="w-4 h-4 text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="hidden xs:inline">Back to Dashboard</span>
            <span className="xs:hidden">Back</span>
          </button>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
            <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
              Merge PDF Workspace
            </h1>
          </div>
        </div>
      </header>

      {/* ── Main Content Container ───────────────────────────────────────────── */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Workspace Intro Hero */}
        <section className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-7 shadow-2xs space-y-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200/70">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
            <span>Organize PDF</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Merge PDF Files
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl">
            Combine multiple PDF documents into a single organized file in any sequence you choose.
            All processing happens securely in your browser.
          </p>
        </section>

        {/* Global Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="rounded-2xl p-4 bg-red-50 border border-red-200/90 text-red-900 flex items-start justify-between gap-3 shadow-xs"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-xs sm:text-sm font-medium leading-relaxed break-words">
                {errorMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage("")}
              className="text-red-500 hover:text-red-800 text-xs font-bold px-1.5 py-0.5 rounded cursor-pointer shrink-0"
              aria-label="Dismiss error message"
            >
              ×
            </button>
          </div>
        )}

        {/* ── Success Banner & Download Area (Only shown after real merge) ──── */}
        {mergeResult && (
          <section
            aria-live="polite"
            className="bg-emerald-50/90 border border-emerald-300 rounded-2xl p-5 sm:p-7 shadow-xs space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-bold text-emerald-950">
                  PDF Documents Successfully Merged!
                </h3>
                <p className="text-xs sm:text-sm text-emerald-800 mt-0.5">
                  Output: <span className="font-semibold">{mergeResult.filename}</span> •{" "}
                  {mergeResult.totalPages} total pages • Size:{" "}
                  <span className="font-semibold">{formatBytes(mergeResult.size)}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={triggerDownload}
                className="min-h-[42px] px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download Merged PDF</span>
              </button>

              <button
                type="button"
                onClick={triggerPreview}
                className="min-h-[42px] px-4 py-2.5 rounded-xl bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>Preview in Browser</span>
              </button>

              <button
                type="button"
                onClick={() => setMergeResult(null)}
                className="min-h-[42px] px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-emerald-800 hover:bg-emerald-100/60 transition-colors cursor-pointer"
              >
                Merge More Files
              </button>
            </div>
          </section>
        )}

        {/* ── Drag & Drop Upload Zone ────────────────────────────────────────── */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-2xl border-2 border-dashed p-6 sm:p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
            isDragging
              ? "border-blue-500 bg-blue-50/70 scale-[0.99]"
              : "border-slate-300 hover:border-blue-400 bg-white hover:bg-slate-50/60"
          }`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          aria-label="Upload PDF files for merging"
        >
          {/* Hidden multi-file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            onChange={(e) => {
              handleAddFiles(e.target.files);
              e.target.value = "";
            }}
            className="hidden"
          />

          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3.5 shadow-2xs">
            <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>

          <p className="text-sm sm:text-base font-bold text-slate-900">
            Drag & drop PDF files here, or <span className="text-blue-600 underline">browse</span>
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Select 2 or more PDF documents. You can reorder them before merging.
          </p>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="mt-4 min-h-[38px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs sm:text-sm font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            Select PDF Files
          </button>
        </div>

        {/* ── Selected Files List & Arrange Controls ─────────────────────────── */}
        {fileList.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Files to Merge ({fileList.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Total size: <span className="font-semibold">{formatBytes(totalInputSize)}</span>. Documents will be merged in the order shown below.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                >
                  + Add More
                </button>
                <button
                  type="button"
                  onClick={clearAllFiles}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* List of Files with Reorder Controls */}
            <div className="divide-y divide-slate-100">
              {fileList.map((item, idx) => (
                <div
                  key={item.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                >
                  {/* Left: Sequence index + File Details */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>

                    <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>

                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatBytes(item.size)}
                      </p>
                    </div>
                  </div>

                  {/* Right: Reorder Up/Down + Remove Buttons */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0 || isMerging}
                      onClick={() => moveFileUp(idx)}
                      title={`Move "${item.name}" up`}
                      className={`min-h-[36px] min-w-[36px] rounded-lg border flex items-center justify-center text-xs font-bold transition-colors ${
                        idx === 0 || isMerging
                          ? "border-slate-100 text-slate-300 cursor-not-allowed"
                          : "border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                      }`}
                      aria-label={`Move ${item.name} up`}
                    >
                      ▲
                    </button>

                    <button
                      type="button"
                      disabled={idx === fileList.length - 1 || isMerging}
                      onClick={() => moveFileDown(idx)}
                      title={`Move "${item.name}" down`}
                      className={`min-h-[36px] min-w-[36px] rounded-lg border flex items-center justify-center text-xs font-bold transition-colors ${
                        idx === fileList.length - 1 || isMerging
                          ? "border-slate-100 text-slate-300 cursor-not-allowed"
                          : "border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                      }`}
                      aria-label={`Move ${item.name} down`}
                    >
                      ▼
                    </button>

                    <button
                      type="button"
                      disabled={isMerging}
                      onClick={() => removeFile(item.id)}
                      title={`Remove "${item.name}"`}
                      className="min-h-[36px] min-w-[36px] rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center text-base font-bold transition-colors cursor-pointer"
                      aria-label={`Remove ${item.name}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Merge Action Row */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs text-slate-500">
                {fileList.length < 2 ? (
                  <span className="text-amber-700 font-medium">
                    ⚠️ Add at least 1 more PDF file to enable merge.
                  </span>
                ) : (
                  <span>
                    Ready to combine <strong className="text-slate-900">{fileList.length}</strong> PDF documents.
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={fileList.length < 2 || isMerging}
                onClick={handleMergeSubmit}
                className={`w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-all ${
                  fileList.length < 2 || isMerging
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-xs cursor-pointer"
                }`}
              >
                {isMerging ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Merging Documents...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                    </svg>
                    <span>Merge {fileList.length} PDF Files</span>
                  </>
                )}
              </button>
            </div>

            {/* Progress Feedback Indicator */}
            {isMerging && (
              <div className="pt-2 space-y-1.5" aria-live="polite">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-medium">{progress.message}</span>
                  <span className="font-bold">{progress.percent}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-200"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}