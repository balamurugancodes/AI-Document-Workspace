import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";

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

// ── 2-Pass Coordinate-Based Table Extractor ──────────────────────────────────
function extractTableFromPage(textContent) {
  if (!textContent || !textContent.items || textContent.items.length === 0) {
    return [];
  }

  const items = textContent.items
    .map((item) => {
      const tx = item.transform[4];
      const ty = item.transform[5];
      return {
        str: item.str || "",
        x: Math.round(tx),
        y: Math.round(ty),
        w: Math.round(item.width || 0),
        h: Math.round(item.height || 0),
      };
    })
    .filter((it) => it.str.trim().length > 0);

  if (items.length === 0) return [];

  // Pass 1: Cluster items into rows by vertical Y position (descending from top to bottom)
  items.sort((a, b) => b.y - a.y || a.x - b.x);

  const rawRows = [];
  const Y_TOLERANCE = 5; // points

  for (const item of items) {
    let matchedRow = rawRows.find((row) => Math.abs(row.y - item.y) <= Y_TOLERANCE);
    if (!matchedRow) {
      matchedRow = { y: item.y, items: [] };
      rawRows.push(matchedRow);
    }
    matchedRow.items.push(item);
  }

  for (const row of rawRows) {
    row.items.sort((a, b) => a.x - b.x);
  }

  // Pass 2: Determine column anchors across rows
  const xPositions = [];
  for (const row of rawRows) {
    for (const item of row.items) {
      xPositions.push(item.x);
    }
  }
  xPositions.sort((a, b) => a - b);

  const colAnchors = [];
  const X_TOLERANCE = 18; // points

  for (const x of xPositions) {
    const existing = colAnchors.find((col) => Math.abs(col - x) <= X_TOLERANCE);
    if (existing === undefined) {
      colAnchors.push(x);
    }
  }
  colAnchors.sort((a, b) => a - b);

  if (colAnchors.length <= 1) {
    return rawRows.map((r) => [r.items.map((it) => it.str).join(" ")]);
  }

  // Populate 2D grid matrix
  const grid = [];
  for (const row of rawRows) {
    const rowCells = new Array(colAnchors.length).fill("");

    for (const item of row.items) {
      let closestColIdx = 0;
      let minDiff = Infinity;
      for (let c = 0; c < colAnchors.length; c++) {
        const diff = Math.abs(colAnchors[c] - item.x);
        if (diff < minDiff) {
          minDiff = diff;
          closestColIdx = c;
        }
      }

      if (rowCells[closestColIdx]) {
        rowCells[closestColIdx] += " " + item.str;
      } else {
        rowCells[closestColIdx] = item.str;
      }
    }

    grid.push(rowCells);
  }

  // Clean empty columns
  const activeColIndices = [];
  for (let c = 0; c < colAnchors.length; c++) {
    const hasData = grid.some((r) => r[c] && r[c].trim().length > 0);
    if (hasData) activeColIndices.push(c);
  }

  if (activeColIndices.length === 0) return [];
  return grid.map((r) => activeColIndices.map((c) => r[c].trim()));
}

export default function PDFToExcel() {
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

  // Table Extraction State
  const [extracting, setExtracting] = useState(false);
  const [extractScope, setExtractScope] = useState("current"); // 'current' | 'all'
  const [tableData, setTableData] = useState([]); // string[][]
  const [extractNotice, setExtractNotice] = useState(null);
  const [copied, setCopied] = useState(false);

  // References
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const pdfDocRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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
  }, []);

  // ── Document Loader ─────────────────────────────────────────────────────────
  const loadPDFDocument = useCallback(async (fileObj) => {
    setLoadingDoc(true);
    setDocError(null);
    setTableData([]);
    setExtractNotice(null);

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

      // Trigger automatic extraction of Page 1
      extractPageData(doc, 1);
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
  }, []);

  // Support forwarded files from Dashboard
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

      const baseScale = (zoom / 100) * 1.2;
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

  // ── Table Extraction Routine ────────────────────────────────────────────────
  const extractPageData = async (docInstance, targetPageNum) => {
    if (!docInstance) return;
    setExtracting(true);
    setExtractNotice(null);

    try {
      const page = await docInstance.getPage(targetPageNum);
      const textContent = await page.getTextContent();
      const extractedGrid = extractTableFromPage(textContent);

      if (extractedGrid.length === 0) {
        setTableData([]);
        setExtractNotice(
          `No text or table cells could be identified on Page ${targetPageNum}. If this page contains a scanned image, OCR is required.`
        );
      } else {
        const maxCols = Math.max(...extractedGrid.map((r) => r.length));
        if (maxCols === 1) {
          setExtractNotice(
            `Extracted single-column text items from Page ${targetPageNum}. No multi-column grid alignment was detected.`
          );
        }
        setTableData(extractedGrid);
      }
    } catch (err) {
      console.error("Extraction error:", err);
      setExtractNotice("Failed to extract text streams from the selected page.");
    } finally {
      setExtracting(false);
    }
  };

  const handleExtractScopeChange = async (scope) => {
    setExtractScope(scope);
    if (!pdfDocRef.current) return;

    if (scope === "current") {
      extractPageData(pdfDocRef.current, currentPage);
    } else if (scope === "all") {
      setExtracting(true);
      setExtractNotice(null);
      try {
        const allRows = [];
        for (let p = 1; p <= numPages; p++) {
          const page = await pdfDocRef.current.getPage(p);
          const textContent = await page.getTextContent();
          const grid = extractTableFromPage(textContent);
          if (grid.length > 0) {
            allRows.push([`--- PAGE ${p} ---`, ...new Array(Math.max(1, grid[0].length - 1)).fill("")]);
            allRows.push(...grid);
          }
        }
        if (allRows.length === 0) {
          setTableData([]);
          setExtractNotice("No extractable table data found across all document pages.");
        } else {
          setTableData(allRows);
        }
      } catch (err) {
        setExtractNotice("Failed to extract data across all pages.");
      } finally {
        setExtracting(false);
      }
    }
  };

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
    setTableData([]);
    setDocError(null);
    setExtractNotice(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Interactive Cell Editing ────────────────────────────────────────────────
  const handleCellChange = (rIdx, cIdx, val) => {
    setTableData((prev) => {
      const next = prev.map((r) => [...r]);
      next[rIdx][cIdx] = val;
      return next;
    });
  };

  const handleAddRow = () => {
    const colCount = tableData[0]?.length || 3;
    setTableData((prev) => [...prev, new Array(colCount).fill("")]);
  };

  const handleAddColumn = () => {
    setTableData((prev) => prev.map((row) => [...row, ""]));
  };

  const handleDeleteRow = (rIdx) => {
    setTableData((prev) => prev.filter((_, idx) => idx !== rIdx));
  };

  // ── Export Actions ──────────────────────────────────────────────────────────
  const baseName = file?.name?.replace(/\.[^/.]+$/, "") || "extracted_table";

  // Native CSV Export (Opens directly in Excel on Windows & Mac)
  const handleDownloadCSV = () => {
    if (!tableData || tableData.length === 0) return;
    const csvContent = tableData
      .map((row) =>
        row
          .map((cell) => {
            const str = String(cell || "");
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(",")
      )
      .join("\r\n");

    // Prepend UTF-8 BOM (\uFEFF) so Excel parses special characters cleanly
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Genuine Binary .xlsx Export using installed SheetJS
  const handleDownloadXLSX = () => {
    if (!tableData || tableData.length === 0) return;

    try {
      const xlsx = XLSX.utils ? XLSX : XLSX.default || XLSX;
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.aoa_to_sheet(tableData);
      xlsx.utils.book_append_sheet(wb, ws, "Extracted Data");

      const wbout = xlsx.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("XLSX export failed:", err);
      alert("Failed to build XLSX workbook. Falling back to CSV export.");
      handleDownloadCSV();
    }
  };

  const handleCopyToClipboard = async () => {
    if (!tableData || tableData.length === 0) return;
    const tsv = tableData.map((row) => row.join("\t")).join("\n");
    await navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const columnCount = useMemo(() => {
    return tableData.length > 0 ? Math.max(...tableData.map((r) => r.length)) : 0;
  }, [tableData]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 antialiased selection:bg-emerald-100 selection:text-emerald-900">
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
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M12 10.875v7.5" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate">
                PDF to Excel
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-500 hidden sm:block truncate">
                Extract tables and tabular data into editable spreadsheets
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
                  ? "border-emerald-500 bg-emerald-50/50 scale-[1.01]"
                  : "border-slate-300 hover:border-emerald-400 hover:bg-slate-50/60"
              }`}
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5 shadow-inner">
                <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M12 10.875v7.5" />
                </svg>
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
                Upload a PDF to Extract Tables to Excel
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-6">
                Drag and drop your PDF here, or browse files from your computer. Our 2-pass analyzer extracts tables into editable spreadsheets.
              </p>

              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-md transition-all active:scale-[0.98]">
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
                  Client-side coordinate extraction
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
                  Editable grid preview
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── LOADED STATE: Two-Column Workspace ───────────────────────────── */}
        {file && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ── LEFT COLUMN: PDF Preview & Page Controls (5 cols) ────────── */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* Document Info Card */}
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
                  <span className="font-semibold text-slate-700">Page Visual Inspector</span>
                  {numPages > 0 && (
                    <span>
                      Page {currentPage} of {numPages}
                    </span>
                  )}
                </div>

                <div className="relative min-h-[340px] max-h-[500px] bg-slate-100/70 rounded-xl overflow-auto p-4 flex items-center justify-center border border-slate-200/60 my-3">
                  {renderingPreview && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-2xs flex flex-col items-center justify-center z-10">
                      <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs font-medium text-slate-600 mt-2">Rendering Page...</span>
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
                    onClick={() => {
                      const nextP = Math.max(1, currentPage - 1);
                      setCurrentPage(nextP);
                      if (extractScope === "current" && pdfDocRef.current) {
                        extractPageData(pdfDocRef.current, nextP);
                      }
                    }}
                    disabled={currentPage <= 1 || renderingPreview}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                    Previous
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Page:</span>
                    <select
                      value={currentPage}
                      onChange={(e) => {
                        const nextP = parseInt(e.target.value, 10);
                        setCurrentPage(nextP);
                        if (extractScope === "current" && pdfDocRef.current) {
                          extractPageData(pdfDocRef.current, nextP);
                        }
                      }}
                      disabled={renderingPreview}
                      className="px-2 py-1 bg-white border border-slate-200 rounded-md text-slate-700 font-medium cursor-pointer"
                    >
                      {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const nextP = Math.min(numPages, currentPage + 1);
                      setCurrentPage(nextP);
                      if (extractScope === "current" && pdfDocRef.current) {
                        extractPageData(pdfDocRef.current, nextP);
                      }
                    }}
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

            {/* ── RIGHT COLUMN: Extracted Spreadsheet Grid & Editor (7 cols) ── */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              {/* Extraction Scope & Actions Bar */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">Scope:</span>
                  <button
                    type="button"
                    onClick={() => handleExtractScopeChange("current")}
                    disabled={extracting}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      extractScope === "current"
                        ? "bg-emerald-50 border-emerald-600 text-emerald-700 shadow-2xs"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Page {currentPage} Only
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExtractScopeChange("all")}
                    disabled={extracting}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      extractScope === "all"
                        ? "bg-emerald-50 border-emerald-600 text-emerald-700 shadow-2xs"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    All {numPages} Pages
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddRow}
                    disabled={extracting || tableData.length === 0}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                  >
                    + Row
                  </button>
                  <button
                    type="button"
                    onClick={handleAddColumn}
                    disabled={extracting || tableData.length === 0}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                  >
                    + Column
                  </button>
                </div>
              </div>

              {/* Informational Diagnostic Banner if Table Detection has Caveats */}
              {extractNotice && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5 shadow-2xs">
                  <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
                  <span>{extractNotice}</span>
                </div>
              )}

              {/* Table Editor Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
                  <div>
                    <h3 className="font-bold text-slate-900">Extracted Spreadsheet Table</h3>
                    <p className="text-[11px] text-slate-500">
                      {tableData.length} {tableData.length === 1 ? "row" : "rows"} &bull; {columnCount} {columnCount === 1 ? "column" : "columns"} (Click any cell to edit)
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyToClipboard}
                      disabled={tableData.length === 0}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                      title="Copy tab-separated table to clipboard for pasting into Excel/Sheets"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                      </svg>
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                {/* Interactive Table Container */}
                <div className="relative my-3 min-h-[260px] max-h-[460px] overflow-auto border border-slate-200/80 rounded-xl bg-slate-50/50">
                  {extracting && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-2xs flex flex-col items-center justify-center z-10">
                      <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs font-medium text-slate-600 mt-2">
                        Analyzing PDF text positions...
                      </span>
                    </div>
                  )}

                  {tableData.length > 0 ? (
                    <table className="w-full border-collapse text-xs font-sans text-slate-800">
                      <thead className="sticky top-0 bg-slate-100/95 backdrop-blur-xs border-b border-slate-200 z-1">
                        <tr>
                          <th className="w-10 px-2 py-2 text-center text-[10px] font-bold text-slate-400 border-r border-slate-200">
                            #
                          </th>
                          {Array.from({ length: columnCount }, (_, cIdx) => (
                            <th
                              key={cIdx}
                              className="px-3 py-2 text-left font-semibold text-slate-600 border-r border-slate-200 min-w-[120px]"
                            >
                              Col {String.fromCharCode(65 + (cIdx % 26))}
                            </th>
                          ))}
                          <th className="w-8 px-2 py-2 text-center text-slate-400"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70 bg-white">
                        {tableData.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-emerald-50/30 transition-colors group">
                            <td className="px-2 py-1.5 text-center text-[10px] font-mono text-slate-400 bg-slate-50/50 border-r border-slate-200 select-none">
                              {rIdx + 1}
                            </td>
                            {Array.from({ length: columnCount }, (_, cIdx) => (
                              <td key={cIdx} className="p-0 border-r border-slate-200/70">
                                <input
                                  type="text"
                                  value={row[cIdx] || ""}
                                  onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-transparent border-0 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 text-xs text-slate-800 transition-all font-sans"
                                />
                              </td>
                            ))}
                            <td className="px-1 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(rIdx)}
                                className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                title="Delete row"
                              >
                                &times;
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-16 text-center text-slate-400">
                      <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M12 10.875v7.5" />
                      </svg>
                      <p className="text-xs">No table data to display.</p>
                    </div>
                  )}
                </div>

                {/* Export Action Controls */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-500">
                    Export format options for Excel & Google Sheets:
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* CSV Download Button (Universal Spreadsheet Format) */}
                    <button
                      type="button"
                      onClick={handleDownloadCSV}
                      disabled={tableData.length === 0}
                      className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Download CSV (.csv)
                    </button>

                    {/* XLSX Binary Workbook Button using installed SheetJS */}
                    <button
                      type="button"
                      onClick={handleDownloadXLSX}
                      disabled={tableData.length === 0}
                      className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.53-4.5h7.5M8.25 9.75h4.5" />
                      </svg>
                      Download Excel (.xlsx)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}