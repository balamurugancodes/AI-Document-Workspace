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

// ── Compression Presets Specification ────────────────────────────────────────
const COMPRESSION_PRESETS = [
  {
    id: "recommended",
    name: "Recommended Compression",
    badge: "Most Popular",
    badgeColor: "bg-blue-100 text-blue-700 border-blue-200",
    description: "Optimal balance between file-size reduction and sharp readability.",
    technicalDetails: "Downsamples embedded raster images to ~150 DPI (Ghostscript /ebook standard).",
    ghostscriptSetting: "/ebook",
    recommendedFor: "Email attachments, web distribution, and everyday business reports.",
  },
  {
    id: "low",
    name: "Low Compression",
    badge: "High Quality",
    badgeColor: "bg-emerald-100 text-emerald-700 border-emerald-200",
    description: "Prioritizes visual quality while performing structural and metadata cleaning.",
    technicalDetails: "Maintains high-resolution graphics at ~300 DPI (Ghostscript /printer standard).",
    ghostscriptSetting: "/printer",
    recommendedFor: "Portfolios, legal contracts, diagrams, and print-ready files.",
  },
  {
    id: "high",
    name: "High Compression",
    badge: "Smallest Size",
    badgeColor: "bg-amber-100 text-amber-700 border-amber-200",
    description: "Maximum byte reduction; fine photographic image detail may soften.",
    technicalDetails: "Aggressively recompresses images down to ~72 DPI (Ghostscript /screen standard).",
    ghostscriptSetting: "/screen",
    recommendedFor: "Strict institutional upload portals (e.g., < 2 MB limits) and mobile archiving.",
  },
];

// ── Dynamic PDF Loader (pdf-lib for structural cleanup & metadata extraction) ──
async function getPDFLib() {
  if (typeof window !== "undefined" && window.PDFLib?.PDFDocument) {
    return window.PDFLib.PDFDocument;
  }
  try {
    const mod = await import("pdf-lib");
    if (mod?.PDFDocument) return mod.PDFDocument;
  } catch {
    // Dynamic CDN fallback if local package is not yet bundled
  }

  if (typeof window !== "undefined") {
    if (!window.__pdfLibLoadingPromise) {
      window.__pdfLibLoadingPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.9/pdf-lib.min.js";
        script.async = true;
        script.onload = () => {
          if (window.PDFLib?.PDFDocument) resolve(window.PDFLib.PDFDocument);
          else reject(new Error("PDFLib loaded from CDN but PDFDocument was not found."));
        };
        script.onerror = () => reject(new Error("Unable to load PDF processing engine."));
        document.head.appendChild(script);
      });
    }
    return window.__pdfLibLoadingPromise;
  }
  throw new Error("Window environment required for PDF processing.");
}

// ── Dynamic PDF.js Loader for Page 1 Canvas Preview ──────────────────────────
async function loadPDFJS() {
  if (typeof window !== "undefined" && window.pdfjsLib) {
    return window.pdfjsLib;
  }
  try {
    const mod = await import("pdfjs-dist");
    if (mod) {
      if (mod.GlobalWorkerOptions && !mod.GlobalWorkerOptions.workerSrc) {
        mod.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${mod.version || "3.11.174"}/pdf.worker.min.js`;
      }
      return mod;
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
            reject(new Error("PDF.js CDN failed to initialize."));
          }
        };
        script.onerror = () => reject(new Error("Could not load PDF preview engine."));
        document.head.appendChild(script);
      });
    }
    return window.__pdfjsLoadingPromise;
  }
  throw new Error("Window environment required for PDF.js.");
}

// ── Main CompressPDF Component ────────────────────────────────────────────────
export default function CompressPDF() {
  const navigate = useNavigate();
  const location = useLocation();

  // File state
  const [file, setFile] = useState(null);
  const [pageCount, setPageCount] = useState(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Preview state
  const canvasRef = useRef(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  // Settings & Execution state
  const [selectedPreset, setSelectedPreset] = useState("recommended");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [errorNotice, setErrorNotice] = useState(null);
  const [backendDiagnostic, setBackendDiagnostic] = useState(null);

  // Result state
  const [result, setResult] = useState(null);
  // result = {
  //   compressedBlob: Blob,
  //   downloadUrl: string,
  //   originalSize: number,
  //   compressedSize: number,
  //   savedBytes: number,
  //   percentReduction: number,
  //   presetUsed: string,
  //   engineUsed: "ghostscript-backend" | "client-structural",
  //   isLarger: boolean
  // }

  const fileInputRef = useRef(null);

  // Clean up object URLs to prevent browser memory leaks
  const cleanupResultUrl = useCallback(() => {
    if (result?.downloadUrl) {
      URL.revokeObjectURL(result.downloadUrl);
    }
  }, [result]);

  useEffect(() => {
    return () => {
      cleanupResultUrl();
    };
  }, [cleanupResultUrl]);

  // ── Render First Page Preview via PDF.js ────────────────────────────────────
  const renderPreview = useCallback(async (fileObj) => {
    if (!fileObj || !canvasRef.current) return;
    setPreviewLoading(true);
    setPreviewError(false);

    try {
      const pdfjs = await loadPDFJS();
      const arrayBuffer = await fileObj.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      setPageCount(pdf.numPages);

      const page = await pdf.getPage(1);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext("2d");
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      // Scale to fit max width of ~340px
      const targetWidth = Math.min(340, unscaledViewport.width);
      const scale = targetWidth / unscaledViewport.width;
      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
      setPreviewLoading(false);
    } catch (err) {
      console.warn("PDF preview render fallback:", err.message);
      setPreviewLoading(false);
      setPreviewError(true);
    }
  }, []);

  // ── Handle Selected File ────────────────────────────────────────────────────
  const handleSelectFile = useCallback(
    async (candidateFile) => {
      if (!candidateFile) return;

      // Reset previous results
      cleanupResultUrl();
      setResult(null);
      setErrorNotice(null);
      setBackendDiagnostic(null);

      // Validation 1: Extension & MIME
      const isPdfExtension = candidateFile.name.toLowerCase().endsWith(".pdf");
      const isPdfMime = candidateFile.type === "application/pdf" || candidateFile.type === "";
      if (!isPdfExtension && !isPdfMime) {
        setErrorNotice({
          title: "Unsupported File Format",
          message: `"${candidateFile.name}" is not a valid PDF document. Please upload a file ending with .pdf.`,
        });
        return;
      }

      // Validation 2: Zero-byte file
      if (candidateFile.size === 0) {
        setErrorNotice({
          title: "Empty PDF Document",
          message: "The selected PDF is 0 bytes and contains no readable data.",
        });
        return;
      }

      // Validation 3: Maximum file size (100 MB limit safeguard)
      const MAX_BYTES = 100 * 1024 * 1024;
      if (candidateFile.size > MAX_BYTES) {
        setErrorNotice({
          title: "File Exceeds Upload Limit",
          message: `The selected PDF is ${formatBytes(candidateFile.size)}. The maximum supported size is 100 MB.`,
        });
        return;
      }

      setIsReadingFile(true);
      setFile(candidateFile);

      // Inspect document validity & page count via pdf-lib
      try {
        const PDFDocument = await getPDFLib();
        const arrayBuffer = await candidateFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: false });
        const count = pdfDoc.getPageCount();
        setPageCount(count);
      } catch (err) {
        const msg = err?.message?.toLowerCase() || "";
        if (msg.includes("encrypt") || msg.includes("password")) {
          setErrorNotice({
            title: "Password-Protected PDF",
            message: "This PDF is encrypted with a password. Please unlock the file before compressing.",
          });
          setFile(null);
          setIsReadingFile(false);
          return;
        } else {
          // File may be corrupted or have a malformed trailer
          setErrorNotice({
            title: "Corrupted or Invalid PDF",
            message: "Unable to parse document structure. The file may be damaged or incomplete.",
          });
          setFile(null);
          setIsReadingFile(false);
          return;
        }
      } finally {
        setIsReadingFile(false);
      }

      // Trigger visual preview
      renderPreview(candidateFile);
    },
    [cleanupResultUrl, renderPreview]
  );

  // Check for files passed from the Dashboard violet upload button
  useEffect(() => {
    if (location.state?.initialFiles && Array.isArray(location.state.initialFiles)) {
      const initial = location.state.initialFiles[0];
      if (initial instanceof File) {
        handleSelectFile(initial);
      }
    }
  }, [location.state, handleSelectFile]);

  // ── Drag & Drop Handlers ────────────────────────────────────────────────────
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const droppedFiles = e.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      handleSelectFile(droppedFiles[0]);
    }
  };

  // ── Clear / Reset Workspace ─────────────────────────────────────────────────
  const handleReset = () => {
    cleanupResultUrl();
    setFile(null);
    setPageCount(null);
    setResult(null);
    setErrorNotice(null);
    setBackendDiagnostic(null);
    setProgressStatus("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Real PDF Compression Execution ──────────────────────────────────────────
  const handleExecuteCompression = async () => {
    if (!file || isProcessing) return;

    setIsProcessing(true);
    setErrorNotice(null);
    setBackendDiagnostic(null);
    cleanupResultUrl();
    setProgressStatus("Preparing document for optimization...");

    const activePresetConfig =
      COMPRESSION_PRESETS.find((p) => p.id === selectedPreset) || COMPRESSION_PRESETS[0];

    try {
      // ───────────────────────────────────────────────────────────────────────
      // STAGE 1: Attempt Genuine Backend Compression (Ghostscript Engine)
      // ───────────────────────────────────────────────────────────────────────
      setProgressStatus("Connecting to compression engine...");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("preset", selectedPreset);
      formData.append("gsSetting", activePresetConfig.ghostscriptSetting);

      let backendSucceeded = false;
      let compressedBlob = null;

      try {
        const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "")
          .trim()
          .replace(/\/+$/, "")
          .replace(/\/api$/i, "");
        const response = await fetch(`${apiBaseUrl}/api/pdf/compress`, {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          compressedBlob = await response.blob();
          if (compressedBlob && compressedBlob.size > 0) {
            backendSucceeded = true;
          }
        } else if (response.status === 404 || response.status === 501 || response.status === 503) {
          // Backend route not registered or engine missing on server
          backendSucceeded = false;
        } else {
          const errJson = await response.json().catch(() => null);
          throw new Error(errJson?.message || `Backend compression failed with status ${response.status}`);
        }
      } catch (fetchErr) {
        // Backend is offline, route not implemented, or connection refused
        backendSucceeded = false;
      }

      // ───────────────────────────────────────────────────────────────────────
      // STAGE 2: Handle Compression Result or Transparent Diagnostic
      // ───────────────────────────────────────────────────────────────────────
      if (backendSucceeded && compressedBlob) {
        const originalBytes = file.size;
        const compressedBytes = compressedBlob.size;
        const savedBytes = originalBytes - compressedBytes;
        const percentReduction = Math.max(0, (savedBytes / originalBytes) * 100);
        const isLarger = compressedBytes >= originalBytes;

        const downloadUrl = URL.createObjectURL(compressedBlob);

        setResult({
          compressedBlob,
          downloadUrl,
          originalSize: originalBytes,
          compressedSize: compressedBytes,
          savedBytes: Math.max(0, savedBytes),
          percentReduction: parseFloat(percentReduction.toFixed(1)),
          presetUsed: activePresetConfig.name,
          engineUsed: "ghostscript-backend",
          isLarger,
        });
        setProgressStatus("");
        return;
      }

      // ───────────────────────────────────────────────────────────────────────
      // STAGE 3: Client-Side Structural Optimization Fallback (Honest Measurement)
      // ───────────────────────────────────────────────────────────────────────
      setProgressStatus("Backend engine offline. Testing client-side structural clean...");
      const PDFDocument = await getPDFLib();
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);

      // Re-save enabling object streams and stripping unused pointers
      const optimizedBytes = await pdfDoc.save({ useObjectStreams: true });
      const optimizedBlob = new Blob([optimizedBytes], { type: "application/pdf" });

      const originalBytes = file.size;
      const compressedBytes = optimizedBlob.size;
      const savedBytes = originalBytes - compressedBytes;
      const percentReduction = Math.max(0, (savedBytes / originalBytes) * 100);
      const isLarger = compressedBytes >= originalBytes;

      const downloadUrl = URL.createObjectURL(optimizedBlob);

      // Deliver genuine diagnostic explaining why client-side reduction was minimal
      setBackendDiagnostic({
        title: "Ghostscript Backend Engine Required for Image Recompression",
        message:
          "Client-side processing completed structural and xref optimization, but could not downsample embedded images. Genuine multi-megabyte compression requires the Node.js Ghostscript backend.",
        requiredAction:
          "To enable 50%–80% compression on image-heavy PDFs, configure the POST /api/pdf/compress route with Ghostscript installed on the host.",
      });

      setResult({
        compressedBlob: optimizedBlob,
        downloadUrl,
        originalSize: originalBytes,
        compressedSize: compressedBytes,
        savedBytes: Math.max(0, savedBytes),
        percentReduction: parseFloat(percentReduction.toFixed(1)),
        presetUsed: activePresetConfig.name,
        engineUsed: "client-structural",
        isLarger,
      });
    } catch (err) {
      console.error("Compression execution error:", err);
      setErrorNotice({
        title: "Compression Could Not Be Completed",
        message:
          err.message ||
          "An unexpected error occurred while processing the PDF. The file may contain unsupported encoding or damaged xref tables.",
      });
    } finally {
      setIsProcessing(false);
      setProgressStatus("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* ── Top Header / Navigation Bar (Strictly No Homepage Button) ────────── */}
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
              Compress PDF Workspace
            </h1>
          </div>
        </div>
      </header>

      {/* ── Main Content Container ───────────────────────────────────────────── */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Workspace Title & Intro */}
        <section className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-7 shadow-2xs">
          <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60 mb-2.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                PDF Optimization Engine
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Compress PDF Document
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Reduce file size for faster sharing and lower storage footprint. Choose your preferred
                balance between file size and graphic fidelity.
              </p>
            </div>

            {file && (
              <button
                type="button"
                onClick={handleReset}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-600 inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ml-auto sm:ml-0"
              >
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset Workspace
              </button>
            )}
          </div>
        </section>

        {/* Global Error Notice Banner */}
        {errorNotice && (
          <div
            className="rounded-2xl border border-red-200 bg-red-50/90 p-4 sm:p-5 flex items-start gap-3 text-red-900 shadow-2xs"
            role="alert"
          >
            <svg
              className="w-5 h-5 text-red-600 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-red-900">{errorNotice.title}</h3>
              <p className="text-xs sm:text-sm text-red-700 mt-0.5 leading-relaxed break-words">
                {errorNotice.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setErrorNotice(null)}
              className="text-red-400 hover:text-red-600 p-1 rounded-lg"
              aria-label="Dismiss error"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Diagnostic Notice Banner (Honest Transparency about Backend vs Client Engine) */}
        {backendDiagnostic && (
          <div
            className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 sm:p-5 flex items-start gap-3 text-amber-900 shadow-2xs"
            role="status"
          >
            <svg
              className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-amber-900">{backendDiagnostic.title}</h3>
              <p className="text-xs sm:text-sm text-amber-800 mt-1 leading-relaxed">
                {backendDiagnostic.message}
              </p>
              <p className="text-xs text-amber-700 mt-1.5 font-medium">
                {backendDiagnostic.requiredAction}
              </p>
            </div>
          </div>
        )}

        {/* ── State 1: Upload Dropzone (When No File Selected) ────────────────── */}
        {!file && (
          <section
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`bg-white rounded-2xl border-2 border-dashed transition-all p-8 sm:p-12 text-center flex flex-col items-center justify-center min-h-[300px] sm:min-h-[360px] ${
              isDragOver
                ? "border-blue-500 bg-blue-50/50 shadow-md scale-[0.99]"
                : "border-slate-300 hover:border-slate-400 shadow-2xs"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleSelectFile(e.target.files[0]);
              }}
            />

            <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-4 shadow-2xs">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>

            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              Choose a PDF file to compress
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-sm">
              Drag and drop your PDF here, or browse your local files. Documents up to 100 MB supported.
            </p>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isReadingFile}
              className="mt-6 min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white shadow-xs transition-all active:scale-[0.98] cursor-pointer inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>{isReadingFile ? "Reading PDF..." : "Browse Files"}</span>
            </button>
          </section>
        )}

        {/* ── State 2: Active File View & Configuration (Responsive 2-Col Grid) ── */}
        {file && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: File Details & PDF Preview (lg:col-span-5) */}
            <div className="lg:col-span-5 space-y-5">
              {/* Document Overview Card */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 truncate" title={file.name}>
                      {file.name}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
                      <span className="font-semibold text-slate-700">{formatBytes(file.size)}</span>
                      <span>•</span>
                      <span>{pageCount !== null ? `${pageCount} page${pageCount === 1 ? "" : "s"}` : "Reading pages..."}</span>
                    </div>
                  </div>

                  {/* Replace Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Choose a different PDF"
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                    aria-label="Replace file"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>

                {/* Hidden File Input for Replace */}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleSelectFile(e.target.files[0]);
                  }}
                />

                {/* PDF Page 1 Preview Canvas */}
                <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col items-center">
                  <div className="w-full flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span className="font-medium">Document Preview (Page 1)</span>
                    {previewLoading && <span className="text-blue-600 animate-pulse">Rendering...</span>}
                  </div>

                  <div className="w-full min-h-[220px] max-h-[340px] bg-slate-100/70 border border-slate-200/80 rounded-xl overflow-hidden flex items-center justify-center p-2">
                    <canvas
                      ref={canvasRef}
                      className={`max-w-full max-h-[320px] object-contain shadow-xs rounded bg-white transition-opacity duration-200 ${
                        previewLoading ? "opacity-30" : "opacity-100"
                      } ${previewError ? "hidden" : "block"}`}
                    />

                    {previewError && (
                      <div className="text-center p-4 text-xs text-slate-400">
                        <svg className="w-8 h-8 mx-auto text-slate-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>Preview rendering not available for this document structure.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Compression Presets & Results (lg:col-span-7) */}
            <div className="lg:col-span-7 space-y-5">
              {/* Preset Selector Card */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-1">
                  Select Compression Level
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Select an optimization profile based on your desired visual clarity and target size.
                </p>

                <div className="space-y-3" role="radiogroup" aria-label="Compression Presets">
                  {COMPRESSION_PRESETS.map((preset) => {
                    const isSelected = selectedPreset === preset.id;
                    return (
                      <div
                        key={preset.id}
                        onClick={() => setSelectedPreset(preset.id)}
                        onKeyDown={(e) => {
                          if (e.key === " " || e.key === "Enter") setSelectedPreset(preset.id);
                        }}
                        tabIndex={0}
                        role="radio"
                        aria-checked={isSelected}
                        className={`p-4 rounded-xl border transition-all cursor-pointer select-none ${
                          isSelected
                            ? "border-blue-600 bg-blue-50/30 ring-2 ring-blue-500/20 shadow-2xs"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                isSelected ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"
                              }`}
                            >
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-slate-900">
                              {preset.name}
                            </span>
                          </div>

                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${preset.badgeColor}`}>
                            {preset.badge}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 mt-2 pl-6 leading-relaxed">
                          {preset.description}
                        </p>

                        <div className="mt-2.5 pl-6 flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                          <span className="font-medium text-slate-500">Target: {preset.technicalDetails}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Execute Button */}
                <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-3">
                  <button
                    type="button"
                    onClick={handleExecuteCompression}
                    disabled={isProcessing}
                    className="w-full sm:w-auto flex-1 min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white shadow-xs transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer inline-flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span>{progressStatus || "Optimizing PDF..."}</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                        <span>Compress PDF Now</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={isProcessing}
                    className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-600 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {/* ── Results Comparison Card (Shown only after processing) ──────── */}
              {result && (
                <div
                  className={`rounded-2xl border p-5 sm:p-6 shadow-2xs transition-all ${
                    result.isLarger
                      ? "bg-amber-50/60 border-amber-200"
                      : "bg-emerald-50/40 border-emerald-200"
                  }`}
                  aria-live="polite"
                >
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          result.isLarger ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                      />
                      <h4 className="text-sm sm:text-base font-extrabold text-slate-900">
                        {result.isLarger ? "Optimization Analysis" : "Compression Successful"}
                      </h4>
                    </div>

                    <span className="text-[11px] font-semibold text-slate-500">
                      Preset: {result.presetUsed}
                    </span>
                  </div>

                  {/* Metrics Comparison Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-200/80 mb-4">
                    <div>
                      <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Original
                      </span>
                      <p className="text-xs sm:text-sm font-bold text-slate-800 mt-0.5">
                        {formatBytes(result.originalSize)}
                      </p>
                    </div>

                    <div>
                      <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Compressed
                      </span>
                      <p
                        className={`text-xs sm:text-sm font-bold mt-0.5 ${
                          result.isLarger ? "text-amber-700" : "text-emerald-700"
                        }`}
                      >
                        {formatBytes(result.compressedSize)}
                      </p>
                    </div>

                    <div>
                      <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Space Saved
                      </span>
                      <p className="text-xs sm:text-sm font-bold text-slate-800 mt-0.5">
                        {result.isLarger ? "0 B" : formatBytes(result.savedBytes)}
                      </p>
                    </div>

                    <div>
                      <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Reduction
                      </span>
                      <p
                        className={`text-xs sm:text-sm font-extrabold mt-0.5 ${
                          result.isLarger ? "text-slate-500" : "text-emerald-600"
                        }`}
                      >
                        {result.isLarger ? "0.0%" : `-${result.percentReduction}%`}
                      </p>
                    </div>
                  </div>

                  {/* Honest Notice If Not Smaller */}
                  {result.isLarger && (
                    <div className="p-3 bg-white rounded-xl border border-amber-200 text-xs text-amber-800 mb-4 leading-relaxed">
                      <strong>Document already optimized:</strong> The original PDF is already tightly compressed
                      or composed purely of vector text. Re-encoding did not yield a smaller byte size. No artificial
                      savings have been reported.
                    </div>
                  )}

                  {/* Download Action Controls */}
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <a
                      href={result.downloadUrl}
                      download={`compressed_${file.name}`}
                      className="w-full sm:w-auto flex-1 min-h-[44px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white shadow-xs transition-all active:scale-[0.98] inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>Download Compressed PDF ({formatBytes(result.compressedSize)})</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => window.open(result.downloadUrl, "_blank")}
                      className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 transition-colors cursor-pointer"
                    >
                      Preview in Tab
                    </button>
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