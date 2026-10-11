import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import mammoth from "mammoth";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// ── File Size Formatting Helper ──────────────────────────────────────────────
function formatBytes(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

// ── WinAnsi Character Sanitizer for Standard PDF Helvetica Fonts ─────────────
function sanitizeWinAnsi(str) {
  if (!str) return "";
  return str
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "* ")
    .replace(/\u00A0/g, " ")
    .replace(/\u2122/g, "(TM)")
    .replace(/[^\x00-\xFF]/g, ""); // Strip characters outside standard WinAnsi
}

// ── Text Wrapping Helper for PDF Canvas ──────────────────────────────────────
function wrapText(text, font, fontSize, maxWidth) {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines = [];
  let currentLine = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      // If a single word exceeds maxWidth, break it into fitting chunks
      const wordWidth = font.widthOfTextAtSize(word, fontSize);
      if (wordWidth > maxWidth) {
        let chunk = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(chunk + char, fontSize) <= maxWidth) {
            chunk += char;
          } else {
            if (chunk) lines.push(chunk);
            chunk = char;
          }
        }
        currentLine = chunk;
      } else {
        currentLine = word;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

// ── Page Size Presets (Width x Height in points) ─────────────────────────────
const PAGE_SIZES = {
  letter: { name: "Letter (8.5 × 11 in)", width: 612, height: 792 },
  a4: { name: "A4 (210 × 297 mm)", width: 595.28, height: 841.89 },
};

// ── Margin Presets (in points) ────────────────────────────────────────────────
const MARGIN_PRESETS = {
  standard: { name: "Standard (1.0 in)", margin: 72 },
  narrow: { name: "Narrow (0.5 in)", margin: 36 },
  wide: { name: "Wide (1.25 in)", margin: 90 },
};

// ── Typography Presets ────────────────────────────────────────────────────────
const TYPOGRAPHY_PRESETS = {
  compact: { name: "Compact (9.5 pt)", fontSize: 9.5, lineHeight: 14 },
  standard: { name: "Standard (11 pt)", fontSize: 11, lineHeight: 16 },
  large: { name: "Large (13 pt)", fontSize: 13, lineHeight: 19 },
};

export default function WordToPDF() {
  const location = useLocation();
  const navigate = useNavigate();

  // Document State
  const [file, setFile] = useState(null);
  const [arrayBuffer, setArrayBuffer] = useState(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [docError, setDocError] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Parsed Word Content Preview State
  const [parsedParagraphs, setParsedParagraphs] = useState([]);
  const [parsingWord, setParsingWord] = useState(false);
  const [wordStats, setWordStats] = useState({ words: 0, characters: 0, paragraphs: 0 });

  // Conversion Settings State
  const [pageSizeKey, setPageSizeKey] = useState("letter");
  const [marginKey, setMarginKey] = useState("standard");
  const [typographyKey, setTypographyKey] = useState("standard");
  const [includePageNumbers, setIncludePageNumbers] = useState(true);
  const [includeHeaderTitle, setIncludeHeaderTitle] = useState(true);

  // Conversion Execution & Output State
  const [converting, setConverting] = useState(false);
  const [convertStep, setConvertStep] = useState("");
  const [convertProgress, setConvertProgress] = useState(0);
  const [convertError, setConvertError] = useState(null);
  const [convertedPDF, setConvertedPDF] = useState(null); // { blob, objectUrl, filename, sizeBytes, pageCount }

  // References
  const fileInputRef = useRef(null);
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

  useEffect(() => {
    return () => {
      cleanupObjectUrls();
    };
  }, [cleanupObjectUrls]);

  // ── Word Document Loader using installed Mammoth ────────────────────────────
  const loadWordDocument = useCallback(
    async (fileObj) => {
      setLoadingDoc(true);
      setDocError(null);
      setConvertError(null);
      setConvertedPDF(null);
      setParsedParagraphs([]);
      cleanupObjectUrls();

      try {
        const lowerName = fileObj.name.toLowerCase();
        if (lowerName.endsWith(".doc") && !lowerName.endsWith(".docx")) {
          throw new Error(
            "Legacy binary '.doc' files are not supported. Please open the file in Microsoft Word and save as modern '.docx', then upload again."
          );
        }
        if (!lowerName.endsWith(".docx")) {
          throw new Error("Invalid file format. Please upload a Microsoft Word document (.docx).");
        }
        if (fileObj.size === 0) {
          throw new Error("The selected file is empty (0 bytes). Please upload a valid Word document.");
        }
        if (fileObj.size > 100 * 1024 * 1024) {
          throw new Error("File exceeds 100 MB limit. Please select a smaller Word document.");
        }

        const buffer = await fileObj.arrayBuffer();
        setFile(fileObj);
        setArrayBuffer(buffer);

        // Parse preview text with installed mammoth package
        setParsingWord(true);
        try {
          const mammothEngine = mammoth.extractRawText ? mammoth : (mammoth.default || mammoth);
          const { value: rawText } = await mammothEngine.extractRawText({ arrayBuffer: buffer });
          const rawLines = rawText
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);

          const totalChars = rawText.length;
          const totalWords = rawText.trim() ? rawText.trim().split(/\s+/).length : 0;

          setParsedParagraphs(rawLines);
          setWordStats({
            words: totalWords,
            characters: totalChars,
            paragraphs: rawLines.length,
          });
        } catch (parseErr) {
          console.error("Mammoth parsing failed:", parseErr);
          throw new Error(
            "Unable to parse the Word document. The file may be corrupt or encrypted."
          );
        } finally {
          setParsingWord(false);
        }
      } catch (err) {
        setDocError(err.message || "Failed to load the Word document.");
        setFile(null);
        setArrayBuffer(null);
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
      loadWordDocument(initial);
    }
  }, [location.state, loadWordDocument]);

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
      loadWordDocument(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      loadWordDocument(e.target.files[0]);
    }
  };

  // ── Reset Handler ───────────────────────────────────────────────────────────
  const handleReset = () => {
    cleanupObjectUrls();
    setFile(null);
    setArrayBuffer(null);
    setParsedParagraphs([]);
    setWordStats({ words: 0, characters: 0, paragraphs: 0 });
    setConvertedPDF(null);
    setDocError(null);
    setConvertError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── DOCX to PDF Conversion Engine using pdf-lib ─────────────────────────────
  const handleConvertToPDF = async () => {
    if (!arrayBuffer || converting) return;

    setConverting(true);
    setConvertError(null);
    setConvertedPDF(null);
    cleanupObjectUrls();
    setConvertProgress(15);
    setConvertStep("Extracting text streams from Word document...");

    try {
      // Step 1: Extract text using installed mammoth
      const mammothEngine = mammoth.extractRawText ? mammoth : (mammoth.default || mammoth);
      const { value: rawText } = await mammothEngine.extractRawText({ arrayBuffer });
      const paragraphs = rawText
        .split(/\r?\n/)
        .map((p) => p.trim())
        .filter(Boolean);

      if (paragraphs.length === 0) {
        throw new Error(
          "The Word document contains no usable text paragraphs. Scanned/image-only Word documents without extractable text cannot be converted."
        );
      }

      setConvertProgress(40);
      setConvertStep("Initializing PDF generator and standard fonts...");

      // Step 2: Initialize pdf-lib document
      const pdfDoc = await PDFDocument.create();
      const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Page dimensions and margins
      const pageSize = PAGE_SIZES[pageSizeKey];
      const margin = MARGIN_PRESETS[marginKey].margin;
      const typo = TYPOGRAPHY_PRESETS[typographyKey];

      const contentWidth = pageSize.width - margin * 2;
      const headerYOffset = pageSize.height - 36;
      const footerYOffset = 30;
      const contentTop = pageSize.height - margin - (includeHeaderTitle ? 20 : 0);
      const contentBottom = margin + (includePageNumbers ? 20 : 0);

      setConvertProgress(65);
      setConvertStep("Typesetting text and wrapping lines...");

      // Step 3: Typesetting & Pagination
      const pages = [];
      let currentPage = pdfDoc.addPage([pageSize.width, pageSize.height]);
      pages.push(currentPage);

      let cursorY = contentTop;
      const baseName = file?.name?.replace(/\.[^/.]+$/, "") || "Document";

      for (let i = 0; i < paragraphs.length; i++) {
        const pText = sanitizeWinAnsi(paragraphs[i]);
        if (!pText) continue;

        const wrappedLines = wrapText(pText, fontRegular, typo.fontSize, contentWidth);

        for (const line of wrappedLines) {
          // If next line exceeds bottom margin boundary, allocate a new page
          if (cursorY - typo.lineHeight < contentBottom) {
            currentPage = pdfDoc.addPage([pageSize.width, pageSize.height]);
            pages.push(currentPage);
            cursorY = contentTop;
          }

          currentPage.drawText(line, {
            x: margin,
            y: cursorY - typo.fontSize,
            size: typo.fontSize,
            font: fontRegular,
            color: rgb(0.12, 0.16, 0.22), // Slate 900
          });

          cursorY -= typo.lineHeight;
        }

        // Paragraph gap spacing
        cursorY -= typo.lineHeight * 0.45;
      }

      // Step 4: Draw Headers & Footers
      setConvertProgress(85);
      setConvertStep("Applying headers, footers, and page numbers...");

      const totalPages = pages.length;
      for (let pIdx = 0; pIdx < totalPages; pIdx++) {
        const p = pages[pIdx];

        // Running Document Header
        if (includeHeaderTitle) {
          const titleText = sanitizeWinAnsi(baseName);
          const truncatedTitle =
            titleText.length > 50 ? titleText.substring(0, 47) + "..." : titleText;
          p.drawText(truncatedTitle, {
            x: margin,
            y: headerYOffset,
            size: 8.5,
            font: fontBold,
            color: rgb(0.55, 0.6, 0.68), // Slate 400
          });

          p.drawLine({
            start: { x: margin, y: headerYOffset - 5 },
            end: { x: pageSize.width - margin, y: headerYOffset - 5 },
            thickness: 0.5,
            color: rgb(0.88, 0.9, 0.94), // Slate 200
          });
        }

        // Running Page Number Footer
        if (includePageNumbers) {
          const pageStr = `Page ${pIdx + 1} of ${totalPages}`;
          const strWidth = fontRegular.widthOfTextAtSize(pageStr, 8.5);
          p.drawText(pageStr, {
            x: pageSize.width - margin - strWidth,
            y: footerYOffset,
            size: 8.5,
            font: fontRegular,
            color: rgb(0.55, 0.6, 0.68),
          });
        }
      }

      setConvertProgress(95);
      setConvertStep("Compiling PDF bytes...");

      const pdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(pdfBlob);
      createdUrlsRef.current.push(objectUrl);

      setConvertProgress(100);
      setConvertedPDF({
        blob: pdfBlob,
        objectUrl,
        filename: `${baseName}.pdf`,
        sizeBytes: pdfBlob.size,
        pageCount: totalPages,
      });
    } catch (err) {
      console.error("DOCX to PDF conversion failed:", err);
      setConvertError(err.message || "An unexpected error occurred during PDF conversion.");
    } finally {
      setConverting(false);
      setConvertStep("");
    }
  };

  // ── Download & Preview Helpers ──────────────────────────────────────────────
  const handleDownloadPDF = () => {
    if (!convertedPDF?.objectUrl) return;
    const link = document.createElement("a");
    link.href = convertedPDF.objectUrl;
    link.download = convertedPDF.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreviewInTab = () => {
    if (!convertedPDF?.objectUrl) return;
    window.open(convertedPDF.objectUrl, "_blank", "noopener,noreferrer");
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
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.53-4.5h7.5M8.25 9.75h4.5" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate">
                Word to PDF
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-500 hidden sm:block truncate">
                Convert Microsoft Word documents (.docx) to PDF format
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
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
              <p className="font-semibold text-red-900">Upload Issue</p>
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

        {/* ── EMPTY STATE: Upload Dropzone ────────────────────────────────── */}
        {!file && (
          <div className="flex-1 flex flex-col items-center justify-center py-8 sm:py-12">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full max-w-2xl border-2 border-dashed rounded-3xl p-8 sm:p-14 text-center cursor-pointer transition-all duration-200 bg-white shadow-xs ${
                isDragOver
                  ? "border-indigo-500 bg-indigo-50/50 scale-[1.01]"
                  : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50/60"
              }`}
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-5 shadow-inner">
                <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.53-4.5h7.5M8.25 9.75h4.5" />
                </svg>
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
                Upload a Word Document to Convert
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-6">
                Drag and drop your <span className="font-semibold text-slate-700">.docx</span> file here, or browse files from your computer. Your document is processed client-side.
              </p>

              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md transition-all active:scale-[0.98]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>Browse Word (.docx) File</span>
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
                  Modern .docx format
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── LOADED STATE: Two-Column Workspace ───────────────────────────── */}
        {file && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ── LEFT COLUMN: File Inspection & Content Preview (7 cols) ──── */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              {/* Document Overview Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.53-4.5h7.5M8.25 9.75h4.5" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate max-w-xs sm:max-w-md" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatBytes(file.size)} &bull; Modern Word (.docx)
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                  Ready to Convert
                </span>
              </div>

              {/* Extracted Document Content Preview Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
                  <span className="font-bold text-slate-800">Document Text Inspection</span>
                  {wordStats.words > 0 && (
                    <span className="text-slate-500">
                      ~{wordStats.words} words &bull; {wordStats.paragraphs} paragraphs
                    </span>
                  )}
                </div>

                <div className="relative min-h-[300px] max-h-[500px] overflow-y-auto p-4 my-3 bg-slate-50 rounded-xl border border-slate-200/60 font-sans text-xs text-slate-700 leading-relaxed space-y-3">
                  {parsingWord && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-2xs flex flex-col items-center justify-center z-10">
                      <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs font-medium text-slate-600 mt-2">
                        Reading Word document paragraphs...
                      </span>
                    </div>
                  )}

                  {parsedParagraphs.length > 0 ? (
                    parsedParagraphs.map((para, idx) => (
                      <p key={idx} className="text-slate-800">
                        {para}
                      </p>
                    ))
                  ) : (
                    <div className="py-12 text-center text-slate-400">
                      <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.53-4.5h7.5M8.25 9.75h4.5" />
                      </svg>
                      <p>Content preview will appear after parser completes.</p>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-400">
                  Text extracted directly from document XML nodes. Formatting will be synthesized into standard PDF pages.
                </p>
              </div>
            </div>

            {/* ── RIGHT COLUMN: Conversion Settings & Results (5 cols) ───── */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              {/* Settings Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-slate-500 mb-4">
                  PDF Page Settings
                </h3>

                {/* 1. Page Format */}
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Page Dimensions
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(PAGE_SIZES).map(([key, config]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPageSizeKey(key)}
                        disabled={converting}
                        className={`py-2 px-3 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                          pageSizeKey === key
                            ? "bg-indigo-50 border-indigo-600 text-indigo-700 shadow-2xs"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {config.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Page Margins */}
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Page Margins
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(MARGIN_PRESETS).map(([key, config]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setMarginKey(key)}
                        disabled={converting}
                        className={`py-2 px-2 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                          marginKey === key
                            ? "bg-indigo-50 border-indigo-600 text-indigo-700 shadow-2xs"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {config.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Typography Size */}
                <div className="mb-5">
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Font Size
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(TYPOGRAPHY_PRESETS).map(([key, config]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTypographyKey(key)}
                        disabled={converting}
                        className={`py-2 px-2 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                          typographyKey === key
                            ? "bg-indigo-50 border-indigo-600 text-indigo-700 shadow-2xs"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {config.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Options */}
                <div className="space-y-2 mb-6 pt-3 border-t border-slate-100">
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includePageNumbers}
                      onChange={(e) => setIncludePageNumbers(e.target.checked)}
                      disabled={converting}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span>Include Page Numbers in Footer</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeHeaderTitle}
                      onChange={(e) => setIncludeHeaderTitle(e.target.checked)}
                      disabled={converting}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span>Include Document Title in Header</span>
                  </label>
                </div>

                {/* 5. Convert Action Button */}
                <div>
                  {!converting ? (
                    <button
                      type="button"
                      onClick={handleConvertToPDF}
                      className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span>Convert to PDF</span>
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-indigo-700 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-ping inline-block" />
                          {convertStep || "Processing..."}
                        </span>
                        <span className="font-bold text-slate-700">{convertProgress}%</span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/80">
                        <div
                          className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                          style={{ width: `${convertProgress}%` }}
                        />
                      </div>
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

              {/* Converted PDF Download Card */}
              {convertedPDF && (
                <div className="bg-white rounded-2xl border border-emerald-200/80 p-5 shadow-xs bg-emerald-50/20">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 truncate">
                        {convertedPDF.filename}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {formatBytes(convertedPDF.sizeBytes)} &bull; {convertedPDF.pageCount} {convertedPDF.pageCount === 1 ? "page" : "pages"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                    <button
                      type="button"
                      onClick={handleDownloadPDF}
                      className="min-h-[44px] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl text-xs font-semibold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Download PDF
                    </button>

                    <button
                      type="button"
                      onClick={handlePreviewInTab}
                      className="min-h-[44px] py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
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