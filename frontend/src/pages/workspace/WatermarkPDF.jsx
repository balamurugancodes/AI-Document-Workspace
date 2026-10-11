import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
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

// ── Color Conversion & Font Sanitization Helpers ─────────────────────────────
function hexToRgbNormalized(hex) {
  let clean = (hex || "#dc2626").replace("#", "");
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return { r: 0.86, g: 0.15, b: 0.15 };
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

function sanitizeTextForPdf(text) {
  if (!text) return "";
  // Replace control characters (\r, \n, \t) and non-WinAnsi chars with spaces
  // so StandardFonts.HelveticaBold.widthOfTextAtSize() and drawText() never throw.
  return String(text)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, " ")
    .trim();
}

// ── Page Range Parser ────────────────────────────────────────────────────────
function parsePageRange(rangeStr, totalPages) {
  if (!rangeStr || !rangeStr.trim()) return [];
  const parts = rangeStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const pages = new Set();
  for (const part of parts) {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map((s) => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end) || start < 1 || end > totalPages || start > end) {
        throw new Error(
          `Invalid page range: "${part}". Range must be between 1 and ${totalPages}.`
        );
      }
      for (let p = start; p <= end; p++) pages.add(p);
    } else {
      const p = parseInt(part, 10);
      if (isNaN(p) || p < 1 || p > totalPages) {
        throw new Error(
          `Invalid page number: "${part}". Must be between 1 and ${totalPages}.`
        );
      }
      pages.add(p);
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

// ── Palette Presets ──────────────────────────────────────────────────────────
const COLOR_PRESETS = [
  { name: "Crimson Red", value: "#dc2626" },
  { name: "Slate Gray", value: "#64748b" },
  { name: "Brand Blue", value: "#2563eb" },
  { name: "Jet Black", value: "#0f172a" },
  { name: "Amber Orange", value: "#d97706" },
  { name: "Emerald Green", value: "#16a34a" },
];

const POSITION_PRESETS = [
  { id: "center", label: "Center" },
  { id: "top-left", label: "Top Left" },
  { id: "top-right", label: "Top Right" },
  { id: "bottom-left", label: "Bottom Left" },
  { id: "bottom-right", label: "Bottom Right" },
];

export default function WatermarkPDF() {
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
  const [zoomScale, setZoomScale] = useState(1.0); // 1.0 = 100%
  const [isRendering, setIsRendering] = useState(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // ── Watermark Mode: "text" | "image" ─────────────────────────────────────────
  const [watermarkType, setWatermarkType] = useState("text");

  // ── Text Watermark Configuration ────────────────────────────────────────────
  const [textText, setTextText] = useState("CONFIDENTIAL");
  const [textFontSize, setTextFontSize] = useState(48); // pt
  const [textColor, setTextColor] = useState("#dc2626");
  const [textOpacity, setTextOpacity] = useState(0.3); // 10% to 100%
  const [textRotation, setTextRotation] = useState(45); // -180 to 180
  const [textPosition, setTextPosition] = useState("center");
  const [isRepeatedPattern, setIsRepeatedPattern] = useState(false);

  // ── Image Watermark Configuration ───────────────────────────────────────────
  const [imageFile, setImageFile] = useState(null);
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [imageScalePercent, setImageScalePercent] = useState(40); // 10% to 100% of page width
  const [imageOpacity, setImageOpacity] = useState(0.4);
  const [imageRotation, setImageRotation] = useState(0);
  const [imagePosition, setImagePosition] = useState("center");

  // ── Page Targeting Options: "all" | "current" | "range" ─────────────────────
  const [pageTargetMode, setPageTargetMode] = useState("all");
  const [customPageRange, setCustomPageRange] = useState("");

  // ── Export Processing State ─────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgressText, setExportProgressText] = useState("");
  const [exportResult, setExportResult] = useState(null);

  // DOM & Data References
  const canvasRef = useRef(null);
  const viewportContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const currentRenderTaskRef = useRef(null);
  const renderSequenceRef = useRef(0);
  const pdfBytesRef = useRef(null);
  const fallbackPageSizesRef = useRef([]);
  const fileBlobUrlRef = useRef(null);
  const exportUrlRef = useRef(null);

  // ── Clean Up Memory & Object URLs Without Cancelling Active Renders ─────────
  const revokeActiveUrls = useCallback(() => {
    if (fileBlobUrlRef.current) {
      URL.revokeObjectURL(fileBlobUrlRef.current);
      fileBlobUrlRef.current = null;
    }
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current);
      exportUrlRef.current = null;
    }
    setFileBlobUrl(null);
    setExportResult(null);
  }, []);

  // Unmount-only cleanup so state changes never cancel an in-flight canvas render
  useEffect(() => {
    return () => {
      if (fileBlobUrlRef.current) {
        URL.revokeObjectURL(fileBlobUrlRef.current);
      }
      if (exportUrlRef.current) {
        URL.revokeObjectURL(exportUrlRef.current);
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

  // ── Reset Watermark Settings to Defaults ────────────────────────────────────
  const handleResetSettings = () => {
    setTextText("CONFIDENTIAL");
    setTextFontSize(48);
    setTextColor("#dc2626");
    setTextOpacity(0.3);
    setTextRotation(45);
    setTextPosition("center");
    setIsRepeatedPattern(false);

    setImageScalePercent(40);
    setImageOpacity(0.4);
    setImageRotation(0);
    setImagePosition("center");

    setPageTargetMode("all");
    setCustomPageRange("");
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current);
      exportUrlRef.current = null;
    }
    setExportResult(null);
  };

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

    // Fallback white page surface if PDF.js worker is unavailable
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

      // Paint clean white paper background before rendering PDF page content
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

  // ── Load Document into Memory & PDF.js ──────────────────────────────────────
  const loadPdfDocument = useCallback(
    async (fileObj) => {
      if (!fileObj) return;

      setIsLoadingPdf(true);
      setIsRendering(false);
      setErrorMessage(null);
      revokeActiveUrls();

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

        // 1. Check %PDF- header signature in the first 1024 bytes
        const headerBytes = new Uint8Array(
          arrayBuffer.slice(0, Math.min(1024, arrayBuffer.byteLength))
        );
        const headerStr = new TextDecoder("latin1").decode(headerBytes);
        if (!headerStr.includes("%PDF-")) {
          setErrorMessage({
            title: "Corrupted or Unsupported PDF",
            message:
              "Could not read document structure. The selected file does not contain a valid PDF header.",
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
                "This PDF is encrypted with a password. Please remove encryption before applying watermarks.",
            });
          } else {
            setErrorMessage({
              title: "Corrupted or Unsupported PDF",
              message:
                "Could not read document structure. The file may be damaged or incomplete.",
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
            message: "This PDF does not contain any readable pages to watermark.",
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

        // 3. Load PDF.js document for visual canvas rendering
        let loadedDoc = null;
        try {
          const loadingTask = pdfjsLib.getDocument({
            data: pdfJsBytes,
          });
          loadedDoc = await loadingTask.promise;
        } catch (pdfJsErr) {
          console.warn(
            "PDF.js preview worker fallback active; using pdf-lib page dimensions:",
            pdfJsErr
          );
          loadedDoc = null;
        }

        const newBlobUrl = URL.createObjectURL(fileObj);
        fileBlobUrlRef.current = newBlobUrl;
        setFileBlobUrl(newBlobUrl);

        setPdfDocument(loadedDoc);
        setPageCount(totalPages);
        setCurrentPage(1);
        setFile(fileObj);
        setIsLoadingPdf(false);
      } catch (err) {
        console.error("Failed to load PDF in WatermarkPDF:", err);
        setIsLoadingPdf(false);
        setIsRendering(false);
        const msg = err?.message?.toLowerCase() || "";
        if (msg.includes("password") || msg.includes("encrypt")) {
          setErrorMessage({
            title: "Password-Protected PDF",
            message:
              "This PDF is encrypted with a password. Please remove encryption before applying watermarks.",
          });
        } else {
          setErrorMessage({
            title: "Corrupted or Unsupported PDF",
            message:
              "Could not read document structure. The file may be damaged or incomplete.",
          });
        }
        setFile(null);
        setPdfDocument(null);
        setPageCount(0);
      }
    },
    [revokeActiveUrls]
  );

  // ── Handle File Selection & Validation ──────────────────────────────────────
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
          message: `"${fileName || "Selected file"}" is not a PDF. Please upload a valid .pdf file.`,
        });
        return;
      }

      if (candidate.size === 0) {
        setErrorMessage({
          title: "Empty Document",
          message: "The selected file is 0 bytes and contains no readable pages.",
        });
        return;
      }

      const MAX_BYTES = 100 * 1024 * 1024;
      if (candidate.size > MAX_BYTES) {
        setErrorMessage({
          title: "File Exceeds Upload Limit",
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
    setImageFile(null);
    setImageDataUrl(null);
    setErrorMessage(null);
    handleResetSettings();
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  // ── Viewport Scale & Page Navigation ────────────────────────────────────────
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

  // ── Handle Watermark Image Upload ───────────────────────────────────────────
  const handleImagePicked = (e) => {
    const candidateImg = e.target.files?.[0];
    if (!candidateImg) return;

    if (!candidateImg.type.startsWith("image/")) {
      setErrorMessage({
        title: "Unsupported Image Type",
        message: "Please choose a PNG, JPEG, or WebP image file.",
      });
      return;
    }

    if (candidateImg.size > 15 * 1024 * 1024) {
      setErrorMessage({
        title: "Image Exceeds Size Limit",
        message: "Watermark image size should be under 15 MB.",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      setImageDataUrl(evt.target?.result);
      setImageFile(candidateImg);
      setWatermarkType("image");
    };
    reader.readAsDataURL(candidateImg);
    e.target.value = "";
  };

  // ── Check if Active Page Receives Watermark ─────────────────────────────────
  const isCurrentPageTargeted = useMemo(() => {
    if (pageTargetMode === "all") return true;
    if (pageTargetMode === "current") return true;
    if (pageTargetMode === "range") {
      try {
        const pages = parsePageRange(customPageRange, pageCount);
        return pages.includes(currentPage);
      } catch {
        return false;
      }
    }
    return true;
  }, [pageTargetMode, customPageRange, pageCount, currentPage]);

  // ── Calculate Anchor Coordinates ────────────────────────────────────────────
  const getAnchorCoords = useCallback((pos, width, height) => {
    switch (pos) {
      case "top-left":
        return { x: width * 0.22, y: height * 0.22 };
      case "top-right":
        return { x: width * 0.78, y: height * 0.22 };
      case "bottom-left":
        return { x: width * 0.22, y: height * 0.78 };
      case "bottom-right":
        return { x: width * 0.78, y: height * 0.78 };
      case "center":
      default:
        return { x: width * 0.5, y: height * 0.5 };
    }
  }, []);

  // ── REAL CLIENT-SIDE PDF EXPORT WITH WATERMARK EMBEDDING ────────────────────
  const handleExportWatermarkedPDF = async () => {
    if (!file || isExporting) return;

    // Validate page range before export
    let targetedPageNumbers = [];
    try {
      if (pageTargetMode === "all") {
        targetedPageNumbers = Array.from({ length: pageCount }, (_, i) => i + 1);
      } else if (pageTargetMode === "current") {
        targetedPageNumbers = [currentPage];
      } else if (pageTargetMode === "range") {
        targetedPageNumbers = parsePageRange(customPageRange, pageCount);
        if (targetedPageNumbers.length === 0) {
          throw new Error("Please specify at least one valid page number in the range.");
        }
      }
    } catch (valErr) {
      setErrorMessage({
        title: "Invalid Page Range Configuration",
        message: valErr.message,
      });
      return;
    }

    if (watermarkType === "image" && !imageDataUrl) {
      setErrorMessage({
        title: "No Watermark Image Selected",
        message: "Please choose a PNG or JPEG image to apply as the watermark.",
      });
      return;
    }

    setIsExporting(true);
    setExportProgressText("Loading document into processing engine...");
    setErrorMessage(null);

    try {
      const sourceBytes =
        pdfBytesRef.current || new Uint8Array(await file.arrayBuffer());
      const pdfDoc = await PDFDocument.load(sourceBytes, {
        ignoreEncryption: true,
      });
      const pages = pdfDoc.getPages();

      // Prepare text font or image asset
      let helveticaBoldFont = null;
      let embeddedImg = null;

      if (watermarkType === "text") {
        helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      } else if (watermarkType === "image" && imageDataUrl) {
        if (imageDataUrl.includes("data:image/png")) {
          embeddedImg = await pdfDoc.embedPng(imageDataUrl);
        } else if (
          imageDataUrl.includes("data:image/jpeg") ||
          imageDataUrl.includes("data:image/jpg")
        ) {
          embeddedImg = await pdfDoc.embedJpg(imageDataUrl);
        } else {
          // Offscreen canvas conversion for WebP
          const pngConverted = await new Promise((res) => {
            const offImg = new Image();
            offImg.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = offImg.width;
              canvas.height = offImg.height;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(offImg, 0, 0);
              res(canvas.toDataURL("image/png"));
            };
            offImg.onerror = () => res(null);
            offImg.src = imageDataUrl;
          });
          if (pngConverted) {
            embeddedImg = await pdfDoc.embedPng(pngConverted);
          }
        }
      }

      setExportProgressText("Applying watermark to designated pages...");

      // Color and opacity values (uppercase to match CSS uppercase preview)
      const rgbColor = hexToRgbNormalized(textColor);
      const pdfRgb = rgb(rgbColor.r, rgbColor.g, rgbColor.b);
      const cleanWatermarkText =
        sanitizeTextForPdf((textText || "CONFIDENTIAL").toUpperCase()) || "CONFIDENTIAL";

      // Apply watermark page by page
      for (const pNum of targetedPageNumbers) {
        if (pNum < 1 || pNum > pages.length) continue;
        const page = pages[pNum - 1];
        const { width: pWidth, height: pHeight } = page.getSize();

        // ── 1. Text Watermark ────────────────────────────────────────────────
        if (watermarkType === "text" && helveticaBoldFont) {
          const baseTextSize = Math.max(12, textFontSize);
          const effectiveSize = isRepeatedPattern
            ? Math.max(10, Math.round(baseTextSize * 0.75))
            : baseTextSize;
          const textWidth = helveticaBoldFont.widthOfTextAtSize(
            cleanWatermarkText,
            effectiveSize
          );
          // CSS rotate(deg) is clockwise; in PDF bottom-left coordinates, -deg is clockwise
          const pdfDeg = -textRotation;
          const rad = (pdfDeg * Math.PI) / 180;

          // Helper to calculate rotated center offset
          const drawRotatedCenteredTextAt = (centerX, centerY) => {
            const offsetX =
              (textWidth / 2) * Math.cos(rad) - (effectiveSize / 3) * Math.sin(rad);
            const offsetY =
              (textWidth / 2) * Math.sin(rad) + (effectiveSize / 3) * Math.cos(rad);

            page.drawText(cleanWatermarkText, {
              x: centerX - offsetX,
              y: centerY - offsetY,
              size: effectiveSize,
              font: helveticaBoldFont,
              color: pdfRgb,
              opacity: textOpacity,
              rotate: degrees(pdfDeg),
            });
          };

          if (isRepeatedPattern) {
            // 3x3 Diagonal Grid
            const cols = [pWidth * 0.2, pWidth * 0.5, pWidth * 0.8];
            const rows = [pHeight * 0.2, pHeight * 0.5, pHeight * 0.8];
            for (const cX of cols) {
              for (const cY of rows) {
                drawRotatedCenteredTextAt(cX, cY);
              }
            }
          } else {
            // Single Watermark at Selected Anchor
            const anchor = getAnchorCoords(textPosition, pWidth, pHeight);
            const pdfY = pHeight - anchor.y;
            drawRotatedCenteredTextAt(anchor.x, pdfY);
          }
        }

        // ── 2. Image Watermark ───────────────────────────────────────────────
        if (watermarkType === "image" && embeddedImg) {
          const targetWidth = (pWidth * imageScalePercent) / 100;
          const aspect = embeddedImg.height / embeddedImg.width;
          const targetHeight = targetWidth * aspect;
          const pdfDeg = -imageRotation;
          const rad = (pdfDeg * Math.PI) / 180;

          const anchor = getAnchorCoords(imagePosition, pWidth, pHeight);
          const pdfY = pHeight - anchor.y;

          const offsetX =
            (targetWidth / 2) * Math.cos(rad) - (targetHeight / 2) * Math.sin(rad);
          const offsetY =
            (targetWidth / 2) * Math.sin(rad) + (targetHeight / 2) * Math.cos(rad);

          page.drawImage(embeddedImg, {
            x: anchor.x - offsetX,
            y: pdfY - offsetY,
            width: targetWidth,
            height: targetHeight,
            opacity: imageOpacity,
            rotate: degrees(pdfDeg),
          });
        }
      }

      setExportProgressText("Compiling final watermarked PDF...");
      const finalPdfBytes = await pdfDoc.save();
      const finalBlob = new Blob([finalPdfBytes], { type: "application/pdf" });

      if (exportUrlRef.current) {
        URL.revokeObjectURL(exportUrlRef.current);
      }
      const downloadUrl = URL.createObjectURL(finalBlob);
      exportUrlRef.current = downloadUrl;

      const baseName = file.name.replace(/\.pdf$/i, "");
      const outputFilename = `${baseName}-watermarked.pdf`;

      setExportResult({
        downloadUrl,
        filename: outputFilename,
        size: finalBlob.size,
        pagesWatermarked: targetedPageNumbers.length,
        totalPages: pageCount,
      });
    } catch (err) {
      console.error("PDF watermark export failed:", err);
      setErrorMessage({
        title: "Export Failed",
        message:
          err?.message ||
          "An unexpected error occurred while embedding watermark into the PDF.",
      });
    } finally {
      setIsExporting(false);
      setExportProgressText("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/90 flex flex-col font-sans text-slate-800 select-none">
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
              Watermark PDF Workspace
            </h1>
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
              Select a PDF Document to Watermark
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">
              Drag and drop your PDF here, or browse local files. Apply customizable text or logo image
              watermarks with live preview and permanent client-side export.
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
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Loading PDF...</span>
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

      {/* ── State 2: Active Workspace with Preview & Settings ─────────────────── */}
      {file && (
        <div className="flex-1 flex flex-col min-h-0">
          <input
            type="file"
            ref={imageInputRef}
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleImagePicked}
          />

          {/* ── Main Workspace Body: Canvas with Live Watermark Overlay & Settings ── */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 bg-slate-200/70">
            {/* Left Column: Live Document Preview (7 Cols) */}
            <div
              ref={viewportContainerRef}
              className="lg:col-span-7 p-4 sm:p-6 overflow-auto flex flex-col items-center justify-start min-h-[460px]"
            >
              {/* Preview Viewport Toolbar */}
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

              {/* Document Container with Synchronized Watermark Visual Overlay */}
              <div
                className="relative shadow-md rounded bg-white transition-all duration-75 inline-block"
                style={{
                  width: `${pageDimensions.width * zoomScale}px`,
                  height: `${pageDimensions.height * zoomScale}px`,
                }}
              >
                {/* 1. Base Canvas */}
                <canvas
                  ref={canvasRef}
                  className={`block w-full h-full transition-opacity duration-150 pointer-events-none ${
                    isRendering ? "opacity-40" : "opacity-100"
                  }`}
                />

                {/* 2. Live Interactive Watermark Overlay (Rendered only if page is targeted) */}
                {isCurrentPageTargeted && (
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {/* Text Watermark Overlay */}
                    {watermarkType === "text" && (
                      <>
                        {isRepeatedPattern ? (
                          /* Repeated 3x3 Diagonal Grid */
                          <div className="w-full h-full grid grid-cols-3 grid-rows-3 p-4">
                            {Array.from({ length: 9 }).map((_, idx) => (
                              <div key={idx} className="flex items-center justify-center overflow-hidden">
                                <span
                                  className="font-extrabold uppercase whitespace-nowrap select-none"
                                  style={{
                                    fontSize: `${textFontSize * zoomScale * 0.75}px`,
                                    color: textColor,
                                    opacity: textOpacity,
                                    transform: `rotate(${textRotation}deg)`,
                                    transformOrigin: "center center",
                                  }}
                                >
                                  {textText || "CONFIDENTIAL"}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          /* Single Text Watermark at Selected Position */
                          (() => {
                            const anchor = getAnchorCoords(
                              textPosition,
                              pageDimensions.width * zoomScale,
                              pageDimensions.height * zoomScale
                            );
                            return (
                              <div
                                className="absolute -translate-x-1/2 -translate-y-1/2 select-none"
                                style={{
                                  left: `${anchor.x}px`,
                                  top: `${anchor.y}px`,
                                }}
                              >
                                <span
                                  className="font-extrabold uppercase whitespace-nowrap block"
                                  style={{
                                    fontSize: `${textFontSize * zoomScale}px`,
                                    color: textColor,
                                    opacity: textOpacity,
                                    transform: `rotate(${textRotation}deg)`,
                                    transformOrigin: "center center",
                                  }}
                                >
                                  {textText || "CONFIDENTIAL"}
                                </span>
                              </div>
                            );
                          })()
                        )}
                      </>
                    )}

                    {/* Image Watermark Overlay */}
                    {watermarkType === "image" && imageDataUrl && (
                      (() => {
                        const targetW =
                          (pageDimensions.width * zoomScale * imageScalePercent) / 100;
                        const anchor = getAnchorCoords(
                          imagePosition,
                          pageDimensions.width * zoomScale,
                          pageDimensions.height * zoomScale
                        );
                        return (
                          <div
                            className="absolute -translate-x-1/2 -translate-y-1/2 select-none"
                            style={{
                              left: `${anchor.x}px`,
                              top: `${anchor.y}px`,
                              width: `${targetW}px`,
                            }}
                          >
                            <img
                              src={imageDataUrl}
                              alt="Watermark Overlay"
                              className="w-full h-auto object-contain pointer-events-none"
                              style={{
                                opacity: imageOpacity,
                                transform: `rotate(${imageRotation}deg)`,
                                transformOrigin: "center center",
                              }}
                            />
                          </div>
                        );
                      })()
                    )}
                  </div>
                )}

                {!isCurrentPageTargeted && (
                  <div className="absolute top-3 left-3 bg-slate-900/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded backdrop-blur-2xs">
                    Watermark excluded on Page {currentPage}
                  </div>
                )}

                {/* Loading Spinner */}
                {(isRendering || isExporting) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-2xs rounded pointer-events-none">
                    <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-md text-xs font-semibold text-slate-700">
                      <svg className="w-4 h-4 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>{exportProgressText || `Rendering Page ${currentPage}...`}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Watermark Settings & Actions (5 Cols) */}
            <aside className="lg:col-span-5 bg-white border-t lg:border-t-0 lg:border-l border-slate-200 p-5 space-y-5 overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Watermark Settings</h3>
                  <p className="text-xs text-slate-500">Configure watermark text, graphics, and page targeting.</p>
                </div>
                <button
                  type="button"
                  onClick={handleResetSettings}
                  className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  Reset Defaults
                </button>
              </div>

              {/* Watermark Type Selector */}
              <div className="flex p-1 bg-slate-100 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setWatermarkType("text")}
                  className={`flex-1 min-h-[36px] text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    watermarkType === "text"
                      ? "bg-white text-blue-600 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Text Watermark
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWatermarkType("image");
                    if (!imageDataUrl) imageInputRef.current?.click();
                  }}
                  className={`flex-1 min-h-[36px] text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    watermarkType === "image"
                      ? "bg-white text-blue-600 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Image Watermark
                </button>
              </div>

              {/* ── Section A: Text Watermark Controls ────────────────────────── */}
              {watermarkType === "text" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                      Watermark Text
                    </label>
                    <input
                      type="text"
                      value={textText}
                      onChange={(e) => setTextText(e.target.value)}
                      placeholder="e.g. CONFIDENTIAL, DRAFT, SAMPLE"
                      className="w-full text-xs font-semibold p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Color Palette */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1.5">
                      Text Color
                    </label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {COLOR_PRESETS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setTextColor(c.value)}
                          className={`w-7 h-7 rounded-full border border-slate-300 ${
                            textColor === c.value ? "ring-2 ring-blue-500 ring-offset-1" : ""
                          }`}
                          style={{ backgroundColor: c.value }}
                          title={c.name}
                        />
                      ))}
                      <input
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="w-7 h-7 rounded-full border border-slate-300 cursor-pointer p-0"
                        title="Custom Color"
                      />
                    </div>
                  </div>

                  {/* Font Size & Opacity */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-[11px] font-semibold text-slate-500 uppercase mb-1">
                        <span>Size</span>
                        <span>{textFontSize} pt</span>
                      </div>
                      <input
                        type="range"
                        min={16}
                        max={96}
                        step={2}
                        value={textFontSize}
                        onChange={(e) => setTextFontSize(parseInt(e.target.value, 10))}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-semibold text-slate-500 uppercase mb-1">
                        <span>Opacity</span>
                        <span>{Math.round(textOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={1.0}
                        step={0.05}
                        value={textOpacity}
                        onChange={(e) => setTextOpacity(parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Rotation Angle */}
                  <div>
                    <div className="flex justify-between text-[11px] font-semibold text-slate-500 uppercase mb-1">
                      <span>Rotation</span>
                      <span>{textRotation}°</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        step={5}
                        value={textRotation}
                        onChange={(e) => setTextRotation(parseInt(e.target.value, 10))}
                        className="w-full"
                      />
                      <button
                        type="button"
                        onClick={() => setTextRotation(45)}
                        className="px-2 py-1 text-[11px] rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold shrink-0"
                      >
                        45°
                      </button>
                    </div>
                  </div>

                  {/* Position & Repeat Mode */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1.5">
                      Watermark Placement
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 mb-2">
                      {POSITION_PRESETS.map((pos) => (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() => {
                            setTextPosition(pos.id);
                            setIsRepeatedPattern(false);
                          }}
                          className={`min-h-[30px] rounded-lg text-xs font-medium border transition-colors ${
                            !isRepeatedPattern && textPosition === pos.id
                              ? "border-blue-600 bg-blue-50 text-blue-700 font-bold"
                              : "border-slate-200 hover:bg-slate-50 text-slate-600"
                          }`}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>

                    <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isRepeatedPattern}
                        onChange={(e) => setIsRepeatedPattern(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <span className="text-xs font-semibold text-slate-700">
                        Tile Repeat (3×3 Diagonal Pattern)
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* ── Section B: Image Watermark Controls ───────────────────────── */}
              {watermarkType === "image" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1.5">
                      Watermark Logo / Graphic
                    </label>
                    {imageDataUrl ? (
                      <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                        <img
                          src={imageDataUrl}
                          alt="Selected Watermark"
                          className="w-12 h-12 object-contain bg-white rounded border border-slate-200 p-1"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">
                            {imageFile?.name || "Logo Image"}
                          </p>
                          <span className="text-[11px] text-slate-500 block">
                            {imageFile ? formatBytes(imageFile.size) : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => imageInputRef.current?.click()}
                          className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 hover:bg-white text-slate-600 font-semibold"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="w-full p-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-400 text-center text-xs font-semibold text-blue-600 bg-blue-50/30"
                      >
                        + Choose PNG or JPEG Logo
                      </button>
                    )}
                  </div>

                  {imageDataUrl && (
                    <>
                      {/* Image Scale & Opacity */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="flex justify-between text-[11px] font-semibold text-slate-500 uppercase mb-1">
                            <span>Scale</span>
                            <span>{imageScalePercent}%</span>
                          </div>
                          <input
                            type="range"
                            min={10}
                            max={90}
                            step={5}
                            value={imageScalePercent}
                            onChange={(e) => setImageScalePercent(parseInt(e.target.value, 10))}
                            className="w-full"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] font-semibold text-slate-500 uppercase mb-1">
                            <span>Opacity</span>
                            <span>{Math.round(imageOpacity * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min={0.1}
                            max={1.0}
                            step={0.05}
                            value={imageOpacity}
                            onChange={(e) => setImageOpacity(parseFloat(e.target.value))}
                            className="w-full"
                          />
                        </div>
                      </div>

                      {/* Rotation */}
                      <div>
                        <div className="flex justify-between text-[11px] font-semibold text-slate-500 uppercase mb-1">
                          <span>Rotation</span>
                          <span>{imageRotation}°</span>
                        </div>
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          step={5}
                          value={imageRotation}
                          onChange={(e) => setImageRotation(parseInt(e.target.value, 10))}
                          className="w-full"
                        />
                      </div>

                      {/* Position */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1.5">
                          Position Anchor
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {POSITION_PRESETS.map((pos) => (
                            <button
                              key={pos.id}
                              type="button"
                              onClick={() => setImagePosition(pos.id)}
                              className={`min-h-[30px] rounded-lg text-xs font-medium border transition-colors ${
                                imagePosition === pos.id
                                  ? "border-blue-600 bg-blue-50 text-blue-700 font-bold"
                                  : "border-slate-200 hover:bg-slate-50 text-slate-600"
                              }`}
                            >
                              {pos.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Section C: Page Targeting Controls ────────────────────────── */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase">
                  Page Selection Target
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPageTargetMode("all")}
                    className={`min-h-[32px] rounded-lg text-xs font-medium border transition-colors ${
                      pageTargetMode === "all"
                        ? "border-blue-600 bg-blue-50 text-blue-700 font-bold"
                        : "border-slate-200 hover:bg-slate-50 text-slate-600"
                    }`}
                  >
                    All Pages
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageTargetMode("current")}
                    className={`min-h-[32px] rounded-lg text-xs font-medium border transition-colors ${
                      pageTargetMode === "current"
                        ? "border-blue-600 bg-blue-50 text-blue-700 font-bold"
                        : "border-slate-200 hover:bg-slate-50 text-slate-600"
                    }`}
                  >
                    Page {currentPage} Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageTargetMode("range")}
                    className={`min-h-[32px] rounded-lg text-xs font-medium border transition-colors ${
                      pageTargetMode === "range"
                        ? "border-blue-600 bg-blue-50 text-blue-700 font-bold"
                        : "border-slate-200 hover:bg-slate-50 text-slate-600"
                    }`}
                  >
                    Custom Range
                  </button>
                </div>

                {pageTargetMode === "range" && (
                  <div>
                    <input
                      type="text"
                      value={customPageRange}
                      onChange={(e) => setCustomPageRange(e.target.value)}
                      placeholder={`e.g. 1-3, 5 (Total: ${pageCount})`}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Enter comma-separated page numbers or ranges within 1 to {pageCount}.
                    </span>
                  </div>
                )}
              </div>

              {/* ── Section D: Execute & Export Action Button ──────────────────── */}
              <div className="pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleExportWatermarkedPDF}
                  disabled={isExporting}
                  className="w-full min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white shadow-xs transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  {isExporting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>{exportProgressText || "Applying Watermark..."}</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>Apply & Export Watermarked PDF</span>
                    </>
                  )}
                </button>
              </div>
            </aside>
          </div>

          {/* ── Export Success Notification Modal ──────────────────────────────── */}
          {exportResult && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs animate-fade-in">
              <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xl max-w-md w-full space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">PDF Watermarking Complete</h3>
                    <p className="text-xs text-slate-500">
                      Watermark baked permanently into document pages.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Output File:</span>
                    <span className="font-semibold text-slate-800 truncate max-w-[200px]" title={exportResult.filename}>
                      {exportResult.filename}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Output Size:</span>
                    <span className="font-semibold text-slate-800">{formatBytes(exportResult.size)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pages Watermarked:</span>
                    <span className="font-semibold text-emerald-600">
                      {exportResult.pagesWatermarked} of {exportResult.totalPages}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                  <a
                    href={exportResult.downloadUrl}
                    download={exportResult.filename}
                    className="w-full sm:flex-1 min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white inline-flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>Download File</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => window.open(exportResult.downloadUrl, "_blank")}
                    className="w-full sm:w-auto min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    Preview
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportResult(null)}
                    className="w-full sm:w-auto min-h-[42px] px-3.5 py-2 rounded-xl border border-transparent hover:bg-slate-100 text-xs font-semibold text-slate-500 transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}