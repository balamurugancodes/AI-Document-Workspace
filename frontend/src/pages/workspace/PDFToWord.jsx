import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Configure PDF.js worker using Vite's local bundled worker with CDN fallback
if (typeof window !== "undefined" && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    pdfWorkerUrl ||
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

// ── File Size Formatting Helper ──────────────────────────────────────────────
function formatBytes(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

// ── Strip Invalid XML 1.0 Control Characters for OpenXML (.docx) Safety ─────
function sanitizeXmlText(str) {
  if (!str) return "";
  return String(str)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Reconstruct Text Lines from PDF.js Text Content Items ────────────────────
function reconstructPageParagraphs(textContent) {
  if (!textContent?.items || textContent.items.length === 0) return [];

  // Group items by vertical position (Y coordinate in PDF coordinate space)
  const lineBuckets = [];
  let currentBucket = [];
  let currentY = null;

  for (const item of textContent.items) {
    const textStr = item.str;
    if (!textStr && textStr !== " ") continue;

    // item.transform: [scaleX, skewY, skewX, scaleY, transX, transY]
    const itemX = item.transform ? item.transform[4] : 0;
    const itemY = item.transform ? Math.round(item.transform[5]) : 0;

    if (currentY === null || Math.abs(itemY - currentY) <= 3) {
      currentBucket.push({ text: textStr, x: itemX });
      currentY = itemY;
    } else {
      if (currentBucket.length > 0) {
        currentBucket.sort((a, b) => a.x - b.x);
        lineBuckets.push({
          lineText: currentBucket.map((c) => c.text).join(" "),
          y: currentY,
        });
      }
      currentBucket = [{ text: textStr, x: itemX }];
      currentY = itemY;
    }
  }

  if (currentBucket.length > 0) {
    currentBucket.sort((a, b) => a.x - b.x);
    lineBuckets.push({
      lineText: currentBucket.map((c) => c.text).join(" "),
      y: currentY,
    });
  }

  // Sort top-to-bottom (in PDF coordinates, higher Y is near the top of the page)
  lineBuckets.sort((a, b) => b.y - a.y);

  // Group lines into paragraphs based on vertical spacing
  const paragraphs = [];
  let paragraphBuffer = [];
  let previousY = null;

  for (const line of lineBuckets) {
    const cleanLine = sanitizeXmlText(line.lineText);
    if (!cleanLine) continue;

    // Detect substantial vertical gaps as paragraph breaks (e.g. > 18pt gap)
    if (previousY !== null && Math.abs(previousY - line.y) > 18) {
      if (paragraphBuffer.length > 0) {
        const joined = sanitizeXmlText(paragraphBuffer.join(" "));
        if (joined) paragraphs.push(joined);
        paragraphBuffer = [];
      }
    }

    paragraphBuffer.push(cleanLine);
    previousY = line.y;
  }

  if (paragraphBuffer.length > 0) {
    const joined = sanitizeXmlText(paragraphBuffer.join(" "));
    if (joined) paragraphs.push(joined);
  }

  return paragraphs;
}

export default function PDFToWord() {
  const navigate = useNavigate();
  const location = useLocation();

  // ── Document State ──────────────────────────────────────────────────────────
  const [file, setFile] = useState(null);
  const [fileBlobUrl, setFileBlobUrl] = useState(null);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageDimensions, setPageDimensions] = useState({ width: 612, height: 792 });

  // ── Viewport & Canvas State ─────────────────────────────────────────────────
  const [zoomScale, setZoomScale] = useState(1.0);
  const [isRendering, setIsRendering] = useState(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // ── Conversion State ────────────────────────────────────────────────────────
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState({
    current: 0,
    total: 0,
    text: "",
  });
  const [conversionResult, setConversionResult] = useState(null);
  // conversionResult = { docxBlob, downloadUrl, filename, size, wordCount, characterCount, pageCount }

  // Extracted text preview store
  const [extractedSampleText, setExtractedSampleText] = useState("");
  const [isScannedWarning, setIsScannedWarning] = useState(false);

  // DOM & Data References
  const canvasRef = useRef(null);
  const viewportContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const currentRenderTaskRef = useRef(null);
  const renderSequenceRef = useRef(0);
  const pdfBytesRef = useRef(null);
  const fallbackPageSizesRef = useRef([]);
  const fileBlobUrlRef = useRef(null);
  const conversionUrlRef = useRef(null);

  // ── Clean Up Memory & Object URLs Without Cancelling Active Renders ─────────
  const revokeActiveUrls = useCallback(() => {
    if (fileBlobUrlRef.current) {
      URL.revokeObjectURL(fileBlobUrlRef.current);
      fileBlobUrlRef.current = null;
    }
    if (conversionUrlRef.current) {
      URL.revokeObjectURL(conversionUrlRef.current);
      conversionUrlRef.current = null;
    }
    setFileBlobUrl(null);
    setConversionResult(null);
  }, []);

  // Unmount-only cleanup so state updates never cancel an in-flight canvas render
  useEffect(() => {
    return () => {
      if (fileBlobUrlRef.current) {
        URL.revokeObjectURL(fileBlobUrlRef.current);
      }
      if (conversionUrlRef.current) {
        URL.revokeObjectURL(conversionUrlRef.current);
      }
      if (currentRenderTaskRef.current) {
        try {
          currentRenderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // ── Render PDF Page to Canvas ───────────────────────────────────────────────
  const renderCurrentPage = useCallback(async (doc, pageNum, scale) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const seq = ++renderSequenceRef.current;

    if (currentRenderTaskRef.current) {
      try {
        currentRenderTaskRef.current.cancel();
      } catch {
        // ignore
      }
      currentRenderTaskRef.current = null;
    }

    // Fallback clean white page if PDF.js visual worker is unavailable
    if (!doc) {
      const fallbackDim = fallbackPageSizesRef.current[pageNum - 1] || {
        width: 612,
        height: 792,
      };
      setPageDimensions(fallbackDim);
      canvas.width = Math.round(fallbackDim.width * scale);
      canvas.height = Math.round(fallbackDim.height * scale);
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      setIsRendering(false);
      return;
    }

    setIsRendering(true);

    try {
      const page = await doc.getPage(pageNum);
      if (seq !== renderSequenceRef.current) return;

      const context = canvas.getContext("2d");
      const viewport = page.getViewport({ scale });

      const unscaled = page.getViewport({ scale: 1.0 });
      setPageDimensions({
        width: Math.round(unscaled.width),
        height: Math.round(unscaled.height),
      });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      // Paint white paper background prior to PDF page rendering
      context.save();
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      const renderTask = page.render(renderContext);
      currentRenderTaskRef.current = renderTask;

      await renderTask.promise;
    } catch (err) {
      if (err?.name !== "RenderingCancelledException") {
        console.warn("Render execution warning:", err);
      }
    } finally {
      if (seq === renderSequenceRef.current) {
        setIsRendering(false);
        currentRenderTaskRef.current = null;
      }
    }
  }, []);

  // Trigger canvas rendering reliably once <canvas ref={canvasRef} /> is mounted
  useEffect(() => {
    if (file && !isLoadingPdf && pageCount > 0) {
      renderCurrentPage(pdfDocument, currentPage, zoomScale);
    }
  }, [file, isLoadingPdf, pdfDocument, currentPage, zoomScale, pageCount, renderCurrentPage]);

  // ── Load PDF Document into Memory ───────────────────────────────────────────
  const loadPdfDocument = useCallback(
    async (fileObj) => {
      if (!fileObj) return;

      setIsLoadingPdf(true);
      setIsRendering(false);
      setErrorMessage(null);
      revokeActiveUrls();
      setIsScannedWarning(false);
      setExtractedSampleText("");

      if (currentRenderTaskRef.current) {
        try {
          currentRenderTaskRef.current.cancel();
        } catch {
          // ignore
        }
        currentRenderTaskRef.current = null;
      }

      try {
        const arrayBuffer = await fileObj.arrayBuffer();

        // 1. Verify %PDF- header signature in the first 1024 bytes
        const headerBytes = new Uint8Array(
          arrayBuffer.slice(0, Math.min(1024, arrayBuffer.byteLength))
        );
        const headerStr = new TextDecoder("latin1").decode(headerBytes);
        if (!headerStr.includes("%PDF-")) {
          setErrorMessage({
            title: "Corrupted or Unsupported Document",
            message:
              "Could not parse document structure. The selected file does not contain a valid PDF header.",
          });
          setFile(null);
          setPdfDocument(null);
          setPageCount(0);
          setIsLoadingPdf(false);
          return;
        }

        // Create independent Uint8Array copies so Web Workers never detach our buffer
        const pdfLibBytes = new Uint8Array(arrayBuffer.slice(0));
        const pdfJsBytes = new Uint8Array(arrayBuffer.slice(0));

        // 2. Validate with pdf-lib (ignoreEncryption: true handles owner-permission PDFs)
        let validatedPdfDoc;
        try {
          validatedPdfDoc = await PDFDocument.load(pdfLibBytes, {
            ignoreEncryption: true,
            updateMetadata: false,
          });
        } catch (pdfLibErr) {
          const msg = (pdfLibErr?.message || "").toLowerCase();
          if (msg.includes("password") || msg.includes("encrypt")) {
            setErrorMessage({
              title: "Password-Protected PDF",
              message:
                "This document is encrypted with a password. Please remove encryption before converting to Word.",
            });
          } else {
            setErrorMessage({
              title: "Corrupted or Unsupported Document",
              message:
                "Could not parse document structure. The file may be damaged or incomplete.",
            });
          }
          setFile(null);
          setPdfDocument(null);
          setPageCount(0);
          setIsLoadingPdf(false);
          return;
        }

        const totalPages = validatedPdfDoc.getPageCount();
        if (!totalPages || totalPages < 1) {
          setErrorMessage({
            title: "Empty Document",
            message: "This PDF does not contain any readable pages to convert.",
          });
          setFile(null);
          setPdfDocument(null);
          setPageCount(0);
          setIsLoadingPdf(false);
          return;
        }

        pdfBytesRef.current = pdfLibBytes;
        const sizes = validatedPdfDoc.getPages().map((p) => {
          const { width, height } = p.getSize();
          return {
            width: Math.round(width || 612),
            height: Math.round(height || 792),
          };
        });
        fallbackPageSizesRef.current = sizes;
        if (sizes[0]) {
          setPageDimensions(sizes[0]);
        }

        // 3. Load PDF.js document for visual canvas preview and text extraction
        const loadingTask = pdfjsLib.getDocument({
          data: pdfJsBytes,
        });
        const loadedDoc = await loadingTask.promise;

        const newBlobUrl = URL.createObjectURL(fileObj);
        fileBlobUrlRef.current = newBlobUrl;
        setFileBlobUrl(newBlobUrl);

        setPdfDocument(loadedDoc);
        setPageCount(loadedDoc.numPages || totalPages);
        setCurrentPage(1);
        setFile(fileObj);
        setIsLoadingPdf(false);

        // Pre-check Page 1 text stream to diagnose if scanned
        try {
          const firstPage = await loadedDoc.getPage(1);
          const textContent = await firstPage.getTextContent();
          const p1Paragraphs = reconstructPageParagraphs(textContent);
          const p1Full = p1Paragraphs.join("\n\n");
          setExtractedSampleText(p1Full.slice(0, 300));
          if (!p1Full || p1Full.trim().length === 0) {
            setIsScannedWarning(true);
          }
        } catch {
          // Non-blocking pre-check
        }
      } catch (err) {
        console.error("Failed to load PDF in PDFToWord:", err);
        setIsLoadingPdf(false);
        setIsRendering(false);
        const msg = err?.message?.toLowerCase() || "";
        if (msg.includes("password") || msg.includes("encrypt")) {
          setErrorMessage({
            title: "Password-Protected PDF",
            message:
              "This document is encrypted with a password. Please remove encryption before converting to Word.",
          });
        } else {
          setErrorMessage({
            title: "Corrupted or Unsupported Document",
            message:
              "Could not parse document structure. The file may be damaged or incomplete.",
          });
        }
        setFile(null);
        setPdfDocument(null);
        setPageCount(0);
      }
    },
    [revokeActiveUrls]
  );

  // ── File Selection & Validation ─────────────────────────────────────────────
  const handleSelectFile = useCallback(
    (candidate) => {
      if (!candidate) return;
      setErrorMessage(null);

      const fileName = (candidate.name || "").trim();
      const isExt = fileName.toLowerCase().endsWith(".pdf");
      const isMime =
        candidate.type === "application/pdf" || candidate.type === "application/x-pdf";
      if (!isExt && !isMime) {
        setErrorMessage({
          title: "Unsupported File Format",
          message: `"${fileName || "Selected file"}" is not a PDF file. Please select a valid .pdf document.`,
        });
        return;
      }

      if (candidate.size === 0) {
        setErrorMessage({
          title: "Empty Document",
          message: "The selected file is 0 bytes and contains no readable data.",
        });
        return;
      }

      const MAX_BYTES = 100 * 1024 * 1024;
      if (candidate.size > MAX_BYTES) {
        setErrorMessage({
          title: "File Exceeds Size Limit",
          message: `The selected document is ${formatBytes(candidate.size)}. The maximum supported limit is 100 MB.`,
        });
        return;
      }

      loadPdfDocument(candidate);
    },
    [loadPdfDocument]
  );

  // Forwarded initial files from Dashboard
  useEffect(() => {
    if (location.state?.initialFiles && Array.isArray(location.state.initialFiles)) {
      const initial = location.state.initialFiles[0];
      if (initial instanceof File) {
        handleSelectFile(initial);
      }
    }
  }, [location.state, handleSelectFile]);

  // ── Drag & Drop ─────────────────────────────────────────────────────────────
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

  const handleResetWorkspace = () => {
    revokeActiveUrls();
    if (currentRenderTaskRef.current) {
      try {
        currentRenderTaskRef.current.cancel();
      } catch {
        // ignore
      }
      currentRenderTaskRef.current = null;
    }
    if (pdfDocument) {
      try {
        pdfDocument.destroy();
      } catch {
        // ignore
      }
    }
    pdfBytesRef.current = null;
    fallbackPageSizesRef.current = [];
    setFile(null);
    setPdfDocument(null);
    setPageCount(0);
    setCurrentPage(1);
    setZoomScale(1.0);
    setIsRendering(false);
    setIsLoadingPdf(false);
    setConversionResult(null);
    setIsScannedWarning(false);
    setExtractedSampleText("");
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Page & Zoom Controls ────────────────────────────────────────────────────
  const changePage = (newPage) => {
    if (newPage < 1 || newPage > pageCount || newPage === currentPage) return;
    setCurrentPage(newPage);
  };

  const handleZoom = (newScale) => {
    const clamped = Math.min(Math.max(newScale, 0.5), 2.5);
    setZoomScale(clamped);
  };

  const handleFitToWidth = () => {
    if (!viewportContainerRef.current || pageDimensions.width === 0) return;
    const containerWidth = viewportContainerRef.current.clientWidth - 48;
    if (containerWidth > 100) {
      const calculatedScale = Math.min(Math.max(containerWidth / pageDimensions.width, 0.5), 2.0);
      handleZoom(parseFloat(calculatedScale.toFixed(2)));
    }
  };

  // ── REAL PDF TO WORD (.DOCX) CONVERSION ENGINE ──────────────────────────────
  const handleConvertToWord = async () => {
    if (!file || isConverting) return;

    setIsConverting(true);
    setErrorMessage(null);
    setConversionProgress({
      current: 0,
      total: pageCount || 1,
      text: "Initializing Word engine...",
    });

    try {
      // Ensure we have an active PDF.js document instance for text extraction
      let activePdfDoc = pdfDocument;
      if (!activePdfDoc) {
        const freshBytes =
          pdfBytesRef.current || new Uint8Array(await file.arrayBuffer());
        const task = pdfjsLib.getDocument({
          data: new Uint8Array(freshBytes.slice(0)),
        });
        activePdfDoc = await task.promise;
      }

      const totalPagesToProcess = activePdfDoc.numPages || pageCount || 1;
      const docxChildren = [];
      let totalWordCount = 0;
      let totalCharCount = 0;
      let pagesWithText = 0;

      // Title header in the Word document
      const cleanDocTitle =
        sanitizeXmlText(file.name.replace(/\.pdf$/i, "")) || "Converted Document";
      docxChildren.push(
        new Paragraph({
          text: cleanDocTitle,
          heading: HeadingLevel.TITLE,
          spacing: { after: 200 },
        })
      );

      // Iterate through every page in the PDF and extract text
      for (let pNum = 1; pNum <= totalPagesToProcess; pNum++) {
        setConversionProgress({
          current: pNum,
          total: totalPagesToProcess,
          text: `Extracting text from Page ${pNum} of ${totalPagesToProcess}...`,
        });

        const page = await activePdfDoc.getPage(pNum);
        const textContent = await page.getTextContent({
          normalizeWhitespace: true,
        });
        const paragraphs = reconstructPageParagraphs(textContent);

        // Page Header divider if document has multiple pages
        if (totalPagesToProcess > 1) {
          docxChildren.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `--- Page ${pNum} ---`,
                  color: "94A3B8",
                  size: 18,
                  italics: true,
                }),
              ],
              spacing: { before: 240, after: 120 },
              alignment: AlignmentType.CENTER,
            })
          );
        }

        if (paragraphs.length > 0) {
          pagesWithText++;
          for (const paraText of paragraphs) {
            const safeParaText = sanitizeXmlText(paraText);
            if (!safeParaText) continue;

            const words = safeParaText.split(/\s+/).filter(Boolean);
            totalWordCount += words.length;
            totalCharCount += safeParaText.length;

            docxChildren.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: safeParaText,
                    size: 23, // 11.5pt standard readable body
                    font: "Calibri",
                  }),
                ],
                spacing: { after: 140, line: 276 }, // 1.15 line spacing
              })
            );
          }
        } else {
          // Page contained no extractable text
          docxChildren.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: "[No extractable text found on this page. May contain scanned image or non-standard vector fonts.]",
                  color: "94A3B8",
                  size: 20,
                  italics: true,
                }),
              ],
              spacing: { after: 120 },
            })
          );
        }
      }

      // Check if entire document was empty / scanned
      if (totalWordCount === 0 || totalCharCount === 0) {
        setIsScannedWarning(true);
        throw new Error(
          "No readable text stream could be extracted. This document appears to be scanned, flattened, or composed purely of raster images. Version 1 converts text-based PDFs and does not include client-side OCR."
        );
      }

      setConversionProgress({
        current: totalPagesToProcess,
        total: totalPagesToProcess,
        text: "Assembling Microsoft Word (.docx) package...",
      });

      // Construct OpenXML Document
      const doc = new Document({
        title: cleanDocTitle,
        description: "Converted from PDF by AI Document Workspace",
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1440, // 1 inch in dxa (twips)
                  right: 1440,
                  bottom: 1440,
                  left: 1440,
                },
              },
            },
            children: docxChildren,
          },
        ],
      });

      // Compile into standard .docx Blob
      const docxBlob = await Packer.toBlob(doc);

      if (conversionUrlRef.current) {
        URL.revokeObjectURL(conversionUrlRef.current);
      }
      const downloadUrl = URL.createObjectURL(docxBlob);
      conversionUrlRef.current = downloadUrl;

      const baseName = file.name.replace(/\.pdf$/i, "");
      const outputFilename = `${baseName}.docx`;

      setConversionResult({
        docxBlob,
        downloadUrl,
        filename: outputFilename,
        size: docxBlob.size,
        wordCount: totalWordCount,
        characterCount: totalCharCount,
        pageCount: totalPagesToProcess,
        pagesWithText,
      });
    } catch (err) {
      console.error("PDF to Word conversion failure:", err);
      setErrorMessage({
        title: "Conversion Error",
        message:
          err?.message || "An unexpected error occurred during OpenXML compilation.",
      });
    } finally {
      setIsConverting(false);
      setConversionProgress({ current: 0, total: 0, text: "" });
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800 select-none">
      {/* ── Top Header (Strictly No Homepage Button) ─────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200/90 hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 inline-flex items-center gap-2 transition-colors cursor-pointer shrink-0"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="hidden xs:inline">Back to Dashboard</span>
            <span className="xs:hidden">Back</span>
          </button>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
            <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
              PDF to Word Converter
            </h1>
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
              v1.0 Text Stream
            </span>
          </div>
        </div>

        {file && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetWorkspace}
              className="min-h-[36px] px-3 py-1 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Close Document</span>
            </button>
          </div>
        )}
      </header>

      {/* ── Error Banner ─────────────────────────────────────────────────────── */}
      {errorMessage && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4">
          <div
            className="rounded-2xl border border-red-200 bg-red-50/95 p-4 flex items-start gap-3 text-red-900 shadow-2xs"
            role="alert"
          >
            <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-red-900">{errorMessage.title}</h3>
              <p className="text-xs sm:text-sm text-red-700 mt-0.5 leading-relaxed break-words">
                {errorMessage.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-red-600 p-1 rounded-lg"
              aria-label="Dismiss error"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── State 1: Dropzone (When No File Loaded) ───────────────────────────── */}
      {!file && (
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col justify-center">
          <section
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`bg-white rounded-3xl border-2 border-dashed transition-all p-8 sm:p-14 text-center flex flex-col items-center justify-center min-h-[340px] sm:min-h-[420px] ${
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
                e.target.value = "";
              }}
            />

            <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-4 shadow-2xs">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>

            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              Select a PDF File to Convert to Word
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">
              Drag and drop your PDF here, or select it from your device. Extracts structured text
              streams and outputs an editable Microsoft Word (.docx) document.
            </p>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoadingPdf}
              className="mt-6 min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white shadow-xs transition-all active:scale-[0.98] cursor-pointer inline-flex items-center gap-2"
            >
              {isLoadingPdf ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Loading Document...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Browse PDF Files</span>
                </>
              )}
            </button>
          </section>
        </main>
      )}

      {/* ── State 2: Active Document Viewport & Conversion Panel ──────────────── */}
      {file && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 bg-slate-200/70">
            {/* Left Column: PDF Live Canvas Viewport (7 Cols) */}
            <div
              ref={viewportContainerRef}
              className="lg:col-span-7 p-4 sm:p-6 overflow-auto flex flex-col items-center justify-start min-h-[460px]"
            >
              {/* Viewport Top Bar */}
              <div className="w-full max-w-2xl bg-white rounded-xl border border-slate-200 px-3 py-2 flex items-center justify-between gap-2 shadow-2xs mb-4">
                {/* Page Navigation */}
                <div className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                  <button
                    type="button"
                    disabled={currentPage <= 1 || isRendering}
                    onClick={() => changePage(currentPage - 1)}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Previous Page"
                  >
                    ‹
                  </button>
                  <span className="px-1 text-[11px] whitespace-nowrap">
                    Page {currentPage} of {pageCount || 1}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= pageCount || isRendering}
                    onClick={() => changePage(currentPage + 1)}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Next Page"
                  >
                    ›
                  </button>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    disabled={zoomScale <= 0.5 || isRendering}
                    onClick={() => handleZoom(zoomScale - 0.25)}
                    className="p-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                    title="Zoom Out"
                  >
                    -
                  </button>
                  <span className="w-10 text-center font-bold text-slate-700 text-[11px]">
                    {Math.round(zoomScale * 100)}%
                  </span>
                  <button
                    type="button"
                    disabled={zoomScale >= 2.5 || isRendering}
                    onClick={() => handleZoom(zoomScale + 0.25)}
                    className="p-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                    title="Zoom In"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={handleFitToWidth}
                    className="px-1.5 py-0.5 rounded border border-slate-200 hover:bg-slate-50 text-[11px] font-semibold text-slate-600"
                  >
                    Fit
                  </button>
                </div>
              </div>

              {/* Document Container */}
              <div
                className="relative shadow-md rounded bg-white transition-all duration-75 inline-block"
                style={{
                  width: `${pageDimensions.width * zoomScale}px`,
                  height: `${pageDimensions.height * zoomScale}px`,
                }}
              >
                <canvas
                  ref={canvasRef}
                  className={`block w-full h-full transition-opacity duration-150 pointer-events-none ${
                    isRendering ? "opacity-40" : "opacity-100"
                  }`}
                />

                {/* Loading Spinner */}
                {(isRendering || isConverting) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-2xs rounded pointer-events-none">
                    <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-md text-xs font-semibold text-slate-700">
                      <svg className="w-4 h-4 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>{conversionProgress.text || `Rendering Page ${currentPage}...`}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Converter Panel & Settings (5 Cols) */}
            <aside className="lg:col-span-5 bg-white border-t lg:border-t-0 lg:border-l border-slate-200 p-5 space-y-5 overflow-y-auto">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Word Document Export</h3>
                <p className="text-xs text-slate-500">
                  Convert PDF text streams into an editable Microsoft Word (.docx) document.
                </p>
              </div>

              {/* Technical Capability Notice */}
              <div className="p-3.5 rounded-xl border border-blue-100 bg-blue-50/60 text-xs text-blue-900 space-y-1.5 leading-relaxed">
                <span className="font-bold flex items-center gap-1.5 text-blue-950">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Version 1.0 Conversion Scope
                </span>
                <p className="text-[11px] text-blue-800">
                  Extracts text runs and organizes paragraphs into OpenXML format. Complex tables, multi-column
                  frames, vector shapes, and embedded images are not reflowed in this version.
                </p>
              </div>

              {/* Scanned PDF Warning Banner if detected */}
              {isScannedWarning && (
                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/80 text-xs text-amber-900 space-y-1">
                  <span className="font-bold flex items-center gap-1.5 text-amber-950">
                    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Scanned Document Notice
                  </span>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Page 1 contains minimal or zero embedded text characters. If this is a scanned photocopy or
                    image-based document, optical character recognition (OCR) will be required to extract text.
                  </p>
                </div>
              )}

              {/* Document Overview Card */}
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-2">
                <span className="font-bold text-slate-500 uppercase text-[11px] block">
                  Source File Details
                </span>
                <div className="flex justify-between">
                  <span className="text-slate-500">File Name:</span>
                  <span className="font-semibold text-slate-800 truncate max-w-[200px]" title={file.name}>
                    {file.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">File Size:</span>
                  <span className="font-semibold text-slate-800">{formatBytes(file.size)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Pages:</span>
                  <span className="font-semibold text-slate-800">{pageCount}</span>
                </div>
              </div>

              {/* Text Sample Inspector (Page 1) */}
              {extractedSampleText && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">
                    Page 1 Extracted Text Sample
                  </span>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 max-h-24 overflow-y-auto font-mono whitespace-pre-wrap leading-relaxed">
                    {extractedSampleText}...
                  </div>
                </div>
              )}

              {/* Convert Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleConvertToWord}
                  disabled={isConverting}
                  className="w-full min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  {isConverting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>
                        Converting ({conversionProgress.current}/{conversionProgress.total})...
                      </span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>Convert to Microsoft Word (.docx)</span>
                    </>
                  )}
                </button>
              </div>

              {/* ── Conversion Results Card ───────────────────────────────────── */}
              {conversionResult && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                      Word Document Ready
                    </h4>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-white p-3 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Words Extracted
                      </span>
                      <span className="font-bold text-slate-800">{conversionResult.wordCount}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Characters
                      </span>
                      <span className="font-bold text-slate-800">{conversionResult.characterCount}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Pages Processed
                      </span>
                      <span className="font-bold text-slate-800">
                        {conversionResult.pagesWithText} of {conversionResult.pageCount}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Docx Size
                      </span>
                      <span className="font-bold text-emerald-700">
                        {formatBytes(conversionResult.size)}
                      </span>
                    </div>
                  </div>

                  <a
                    href={conversionResult.downloadUrl}
                    download={conversionResult.filename}
                    className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white inline-flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>Download {conversionResult.filename}</span>
                  </a>
                </div>
              )}
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}