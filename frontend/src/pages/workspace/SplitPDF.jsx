import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// ── Dynamic PDFLib Loader (Works with local npm package OR resilient CDN fallback)
let cdnLoadingPromise = null;
async function getPDFDocumentClass() {
  if (typeof window !== "undefined" && window.PDFLib?.PDFDocument) {
    return window.PDFLib.PDFDocument;
  }

  try {
    const mod = await import("pdf-lib");
    if (mod?.PDFDocument) return mod.PDFDocument;
  } catch {
    // Fall back to CDN if local module is not bundled yet
  }

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

// ── Helper: Parse and Validate User Page Range String ─────────────────────────
function parsePageRanges(rangeStr, totalPages) {
  if (!rangeStr || !rangeStr.trim()) {
    throw new Error("Please specify at least one page or page range (e.g. 1-3, 5).");
  }

  const rawParts = rangeStr.split(",").map((s) => s.trim()).filter(Boolean);
  if (rawParts.length === 0) {
    throw new Error("Please specify valid page numbers (e.g. 1-3 or 1, 2, 4).");
  }

  const pageIndices = [];

  for (const part of rawParts) {
    if (part.includes("-")) {
      const sides = part.split("-").map((s) => s.trim());
      if (sides.length !== 2) {
        throw new Error(`Invalid range format: "${part}". Use format like 1-3.`);
      }
      const start = parseInt(sides[0], 10);
      const end = parseInt(sides[1], 10);

      if (Number.isNaN(start) || Number.isNaN(end)) {
        throw new Error(`Range "${part}" contains non-numeric page numbers.`);
      }
      if (start < 1) {
        throw new Error(`Page numbers start at 1 (found ${start} in "${part}").`);
      }
      if (end < start) {
        throw new Error(`Invalid range "${part}": end page cannot be smaller than start page.`);
      }
      if (end > totalPages) {
        throw new Error(
          `Page ${end} exceeds total pages in document (${totalPages} pages available).`
        );
      }

      for (let p = start; p <= end; p++) {
        pageIndices.push(p - 1);
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (Number.isNaN(pageNum)) {
        throw new Error(`"${part}" is not a valid page number.`);
      }
      if (pageNum < 1) {
        throw new Error(`Page numbers start at 1 (found ${pageNum}).`);
      }
      if (pageNum > totalPages) {
        throw new Error(
          `Page ${pageNum} exceeds total pages in document (${totalPages} pages available).`
        );
      }
      pageIndices.push(pageNum - 1);
    }
  }

  // Deduplicate while preserving sequence
  const uniqueIndices = Array.from(new Set(pageIndices));
  if (uniqueIndices.length === 0) {
    throw new Error("No valid pages selected to extract.");
  }

  return uniqueIndices;
}

// ── Client-Side PDF Splitting Engine ──────────────────────────────────────────
async function executePDFSplit(file, mode, rangeStr, totalPages, onProgress) {
  onProgress({ percent: 10, message: "Initializing PDF processing engine..." });
  const PDFDocument = await getPDFDocumentClass();

  onProgress({ percent: 20, message: `Reading "${file.name}"...` });
  const arrayBuffer = await file.arrayBuffer();

  let sourceDoc;
  try {
    sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: false });
  } catch (err) {
    const msg = String(err?.message || "").toLowerCase();
    if (msg.includes("encrypt") || msg.includes("password")) {
      throw new Error(
        `"${file.name}" is password-protected. Please remove encryption before splitting.`
      );
    }
    throw new Error(`"${file.name}" is corrupted or is not a valid PDF document.`);
  }

  const baseFileName = file.name.replace(/\.[^/.]+$/, "");

  // MODE 1: Extract specified page range into one combined document
  if (mode === "range") {
    const indicesToExtract = parsePageRanges(rangeStr, totalPages);
    onProgress({
      percent: 45,
      message: `Extracting ${indicesToExtract.length} selected page(s)...`,
    });

    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(sourceDoc, indicesToExtract);
    copiedPages.forEach((p) => newDoc.addPage(p));

    onProgress({ percent: 85, message: "Compiling output PDF..." });
    const outputBytes = await newDoc.save();
    const blob = new Blob([outputBytes], { type: "application/pdf" });

    onProgress({ percent: 100, message: "Split completed successfully!" });
    return {
      type: "single",
      files: [
        {
          name: `${baseFileName}-extracted.pdf`,
          blob,
          downloadUrl: URL.createObjectURL(blob),
          pageCount: indicesToExtract.length,
          size: outputBytes.byteLength,
        },
      ],
      totalCreated: 1,
    };
  }

  // MODE 2: Split every page into its own individual document
  if (mode === "single_pages") {
    const results = [];
    for (let pIdx = 0; pIdx < totalPages; pIdx++) {
      const stepPercent = 25 + Math.round((pIdx / totalPages) * 65);
      onProgress({
        percent: stepPercent,
        message: `Extracting page ${pIdx + 1} of ${totalPages}...`,
      });

      const singleDoc = await PDFDocument.create();
      const [copiedPage] = await singleDoc.copyPages(sourceDoc, [pIdx]);
      singleDoc.addPage(copiedPage);

      const pageBytes = await singleDoc.save();
      const blob = new Blob([pageBytes], { type: "application/pdf" });
      results.push({
        name: `${baseFileName}-page-${pIdx + 1}.pdf`,
        blob,
        downloadUrl: URL.createObjectURL(blob),
        pageCount: 1,
        size: pageBytes.byteLength,
      });
    }

    onProgress({ percent: 100, message: "All pages split successfully!" });
    return {
      type: "multiple",
      files: results,
      totalCreated: results.length,
    };
  }

  throw new Error("Unsupported split mode selected.");
}

export default function SplitPDF() {
  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // ── State ───────────────────────────────────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [splitMode, setSplitMode] = useState("range"); // "range" | "single_pages"
  const [rangeInput, setRangeInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, message: "" });
  const [splitResult, setSplitResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  // Clean up object URLs on unmount or reset
  useEffect(() => {
    return () => {
      if (splitResult?.files) {
        splitResult.files.forEach((f) => URL.revokeObjectURL(f.downloadUrl));
      }
    };
  }, [splitResult]);

  // ── Helper: Load & Validate a Single File ───────────────────────────────────
  const processSelectedFile = async (file) => {
    setErrorMessage("");
    setSplitResult(null);

    const lower = (file.name || "").toLowerCase();
    if (!lower.endsWith(".pdf") && file.type !== "application/pdf") {
      setErrorMessage(`"${file.name}" is not a valid PDF file. Split PDF accepts .pdf files only.`);
      return;
    }

    if (file.size === 0) {
      setErrorMessage(`"${file.name}" is empty (0 bytes) and cannot be split.`);
      return;
    }

    setIsLoadingPages(true);

    try {
      const PDFDocument = await getPDFDocumentClass();
      const arrayBuffer = await file.arrayBuffer();
      const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: false });
      const pages = doc.getPageCount();

      if (pages === 0) {
        throw new Error(`"${file.name}" contains no pages.`);
      }

      setSelectedFile({
        rawFile: file,
        name: file.name,
        size: file.size,
        totalPages: pages,
      });

      // Default reasonable range suggestion
      setRangeInput(pages > 1 ? `1-${Math.min(pages, 2)}` : "1");
    } catch (err) {
      const msg = String(err?.message || "").toLowerCase();
      if (msg.includes("encrypt") || msg.includes("password")) {
        setErrorMessage(
          `"${file.name}" is password-protected. Please remove encryption before splitting.`
        );
      } else {
        setErrorMessage(
          `Failed to load "${file.name}". The document may be corrupted or unreadable.`
        );
      }
      setSelectedFile(null);
    } finally {
      setIsLoadingPages(false);
    }
  };

  // ── Pre-populate if file was forwarded from Dashboard ───────────────────────
  useEffect(() => {
    const passed = location.state?.initialFiles;
    if (Array.isArray(passed) && passed.length > 0 && passed[0]) {
      processSelectedFile(passed[0]);
    }
  }, [location.state]);

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
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  // ── Trigger File Merge / Split ──────────────────────────────────────────────
  const handleSplitSubmit = async () => {
    if (!selectedFile) {
      setErrorMessage("Please select a PDF file first.");
      return;
    }

    setErrorMessage("");

    // Validate range upfront if in range mode
    if (splitMode === "range") {
      try {
        parsePageRanges(rangeInput, selectedFile.totalPages);
      } catch (validationErr) {
        setErrorMessage(validationErr.message);
        return;
      }
    }

    setIsSplitting(true);
    setProgress({ percent: 5, message: "Preparing split operation..." });

    try {
      const result = await executePDFSplit(
        selectedFile.rawFile,
        splitMode,
        rangeInput,
        selectedFile.totalPages,
        (prog) => setProgress(prog)
      );
      setSplitResult(result);
    } catch (err) {
      setErrorMessage(err?.message || "An unexpected error occurred while splitting the PDF.");
    } finally {
      setIsSplitting(false);
    }
  };

  // ── Download Helpers ────────────────────────────────────────────────────────
  const triggerSingleDownload = (fileItem) => {
    const a = document.createElement("a");
    a.href = fileItem.downloadUrl;
    a.download = fileItem.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const triggerDownloadAll = () => {
    if (!splitResult?.files) return;
    splitResult.files.forEach((fileItem, idx) => {
      setTimeout(() => {
        triggerSingleDownload(fileItem);
      }, idx * 250);
    });
  };

  const triggerPreview = (fileItem) => {
    window.open(fileItem.downloadUrl, "_blank");
  };

  const resetAll = () => {
    setSelectedFile(null);
    setSplitResult(null);
    setErrorMessage("");
    setRangeInput("");
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 flex flex-col overflow-x-hidden">
      {/* ── Top Header / Navigation Bar (No Homepage button) ─────────────────── */}
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
            <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
            <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
              Split PDF Workspace
            </h1>
          </div>
        </div>
      </header>

      {/* ── Main Content Container ───────────────────────────────────────────── */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Workspace Intro Hero */}
        <section className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-7 shadow-2xs space-y-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-200/70">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <span>Organize PDF</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Split PDF Document
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl">
            Extract custom page ranges or separate every page of your PDF into individual files.
            All processing runs client-side inside your browser for total confidentiality.
          </p>
        </section>

        {/* Global Error Alert */}
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
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {/* ── Success Banner & Output Results (Only shown after real split) ──── */}
        {splitResult && (
          <section
            aria-live="polite"
            className="bg-emerald-50/90 border border-emerald-300 rounded-2xl p-5 sm:p-7 shadow-xs space-y-4"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-emerald-950">
                    PDF Successfully Split!
                  </h3>
                  <p className="text-xs sm:text-sm text-emerald-800 mt-0.5">
                    Created <span className="font-semibold">{splitResult.totalCreated}</span> document
                    {splitResult.totalCreated === 1 ? "" : "s"}.
                  </p>
                </div>
              </div>

              {splitResult.totalCreated > 1 && (
                <button
                  type="button"
                  onClick={triggerDownloadAll}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Download All ({splitResult.totalCreated})</span>
                </button>
              )}
            </div>

            {/* List of Generated PDF Files */}
            <div className="divide-y divide-emerald-200/80 bg-white/70 rounded-xl border border-emerald-200 max-h-72 overflow-y-auto">
              {splitResult.files.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                      {item.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {item.pageCount} page{item.pageCount === 1 ? "" : "s"} • {formatBytes(item.size)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => triggerPreview(item)}
                      className="min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerSingleDownload(item)}
                      className="min-h-[34px] px-3.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>Download</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSplitResult(null)}
                className="text-xs font-semibold text-emerald-800 hover:underline cursor-pointer"
              >
                ← Split another range with this file
              </button>
              <button
                type="button"
                onClick={resetAll}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Upload different file
              </button>
            </div>
          </section>
        )}

        {/* ── Step 1: Upload Zone (If no file is selected) ───────────────────── */}
        {!selectedFile && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-2xl border-2 border-dashed p-6 sm:p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
              isDragging
                ? "border-indigo-500 bg-indigo-50/70 scale-[0.99]"
                : "border-slate-300 hover:border-indigo-400 bg-white hover:bg-slate-50/60"
            }`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            aria-label="Upload PDF file for splitting"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  processSelectedFile(e.target.files[0]);
                }
                e.target.value = "";
              }}
              className="hidden"
            />

            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3.5 shadow-2xs">
              <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>

            <p className="text-sm sm:text-base font-bold text-slate-900">
              Drag & drop a PDF file here, or <span className="text-indigo-600 underline">browse</span>
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Select any PDF document to extract pages or divide it into multiple files.
            </p>

            <button
              type="button"
              disabled={isLoadingPages}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="mt-4 min-h-[38px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs sm:text-sm font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              {isLoadingPages ? "Reading PDF..." : "Select PDF File"}
            </button>
          </div>
        )}

        {/* ── Step 2: Selected File Info & Split Configuration ───────────────── */}
        {selectedFile && (
          <section className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-7 space-y-6">
            {/* File Header Card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200/70">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Size: <span className="font-semibold text-slate-700">{formatBytes(selectedFile.size)}</span> • Total Pages:{" "}
                    <span className="font-bold text-indigo-700 px-1.5 py-0.2 bg-indigo-50 rounded">
                      {selectedFile.totalPages} {selectedFile.totalPages === 1 ? "page" : "pages"}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-white text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                >
                  Change File
                </button>
                <button
                  type="button"
                  onClick={resetAll}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  Remove
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    processSelectedFile(e.target.files[0]);
                  }
                  e.target.value = "";
                }}
                className="hidden"
              />
            </div>

            {/* Split Mode Options */}
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Choose Split Mode
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSplitMode("range")}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                    splitMode === "range"
                      ? "border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-500/20"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-bold text-slate-900">
                      Extract Custom Page Range
                    </span>
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        splitMode === "range"
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-slate-300"
                      }`}
                    >
                      {splitMode === "range" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Select specific pages or ranges (e.g. 1-3, 5) into a single extracted document.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSplitMode("single_pages")}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                    splitMode === "single_pages"
                      ? "border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-500/20"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-bold text-slate-900">
                      Split Every Page Separately
                    </span>
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        splitMode === "single_pages"
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-slate-300"
                      }`}
                    >
                      {splitMode === "single_pages" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Divide the document so every single page becomes its own separate PDF file.
                  </p>
                </button>
              </div>
            </div>

            {/* Mode-Specific Settings: Page Range Input */}
            {splitMode === "range" && (
              <div className="space-y-2 p-4 rounded-xl bg-slate-50/70 border border-slate-200/80">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <label htmlFor="range-input-field" className="text-xs sm:text-sm font-bold text-slate-900">
                    Page Numbers or Ranges to Extract:
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Document has {selectedFile.totalPages} pages total
                  </span>
                </div>

                <div className="relative">
                  <input
                    id="range-input-field"
                    type="text"
                    value={rangeInput}
                    onChange={(e) => setRangeInput(e.target.value)}
                    placeholder={`e.g. 1-${Math.min(selectedFile.totalPages, 3)}, ${selectedFile.totalPages}`}
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-slate-300 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-500">
                  <span className="font-semibold">Quick Presets:</span>
                  <button
                    type="button"
                    onClick={() => setRangeInput("1")}
                    className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
                  >
                    Page 1 only
                  </button>
                  {selectedFile.totalPages > 1 && (
                    <button
                      type="button"
                      onClick={() => setRangeInput(`1-${Math.min(selectedFile.totalPages, 2)}`)}
                      className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
                    >
                      First 2 pages
                    </button>
                  )}
                  {selectedFile.totalPages > 2 && (
                    <button
                      type="button"
                      onClick={() => setRangeInput(`1-${selectedFile.totalPages - 1}`)}
                      className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
                    >
                      All except last
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setRangeInput(`1-${selectedFile.totalPages}`)}
                    className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
                  >
                    All pages (1-{selectedFile.totalPages})
                  </button>
                </div>
              </div>
            )}

            {splitMode === "single_pages" && (
              <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 text-xs sm:text-sm text-slate-700 space-y-1">
                <p className="font-semibold text-slate-900">
                  Ready to split into {selectedFile.totalPages} individual files.
                </p>
                <p className="text-slate-500 text-xs">
                  Each page will be compiled into its own clean PDF document that can be downloaded individually or together.
                </p>
              </div>
            )}

            {/* Split Action Button */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <span className="text-xs text-slate-500">
                {splitMode === "range"
                  ? "Validated page range will be merged into a single output file."
                  : `Will create ${selectedFile.totalPages} separate PDF documents.`}
              </span>

              <button
                type="button"
                disabled={isSplitting}
                onClick={handleSplitSubmit}
                className={`w-full sm:w-auto min-h-[44px] px-7 py-2.5 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isSplitting
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-xs"
                }`}
              >
                {isSplitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Splitting PDF...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    <span>
                      {splitMode === "range" ? "Split & Extract Pages" : `Split into ${selectedFile.totalPages} Files`}
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* Progress Feedback Indicator */}
            {isSplitting && (
              <div className="pt-2 space-y-1.5" aria-live="polite">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-medium">{progress.message}</span>
                  <span className="font-bold">{progress.percent}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all duration-200"
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