import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Configure PDF.js worker using Vite's local asset resolution with CDN fallback
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

// ── Unique ID Generator for Annotations ──────────────────────────────────────
function generateAnnotationId() {
  return `anno_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ── Color Conversion & Font Sanitization Helpers ─────────────────────────────
function hexToPdfRgb(hex, rgbFn) {
  let clean = (hex || "#0f172a").replace("#", "");
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return rgbFn(0.06, 0.09, 0.16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return rgbFn(r, g, b);
}

function sanitizeTextForPdf(text) {
  if (!text) return "";
  // Normalize CR/LF and tabs first because WinAnsi (StandardFonts.Helvetica)
  // throws if \r or \t is passed to page.drawText(), while \n is supported.
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, "    ")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, " ");
}

const COLOR_PRESETS = [
  { name: "Dark Slate", value: "#0f172a" },
  { name: "Brand Blue", value: "#2563eb" },
  { name: "Crimson Red", value: "#dc2626" },
  { name: "Emerald Green", value: "#16a34a" },
  { name: "Amber Orange", value: "#d97706" },
  { name: "Violet", value: "#7c3aed" },
];

const HIGHLIGHT_COLOR_PRESETS = [
  { name: "Canary Yellow", value: "#fde047" },
  { name: "Neon Green", value: "#86efac" },
  { name: "Cyan Blue", value: "#67e8f9" },
  { name: "Hot Pink", value: "#f472b6" },
];

export default function EditPDF() {
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

  // ── Stage 2 Annotation Tools State ──────────────────────────────────────────
  // Tools: "select" | "text" | "image" | "draw" | "highlight" | "eraser"
  const [activeTool, setActiveTool] = useState("select");
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);

  // Styling defaults
  const [textColor, setTextColor] = useState("#0f172a");
  const [fontSize, setFontSize] = useState(16);
  const [strokeColor, setStrokeColor] = useState("#2563eb");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [highlightColor, setHighlightColor] = useState("#fde047");
  const [highlightWidth, setHighlightWidth] = useState(18);

  // Annotations mapped by page number: { [pageNum: number]: Annotation[] }
  const [annotationsByPage, setAnnotationsByPage] = useState({});
  const [currentStroke, setCurrentStroke] = useState(null);

  // Undo / Redo History Stack
  const [historyStack, setHistoryStack] = useState([]);
  const [historyPointer, setHistoryPointer] = useState(-1);

  // ── Stage 3 Export State ────────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgressText, setExportProgressText] = useState("");
  const [exportResult, setExportResult] = useState(null);

  // DOM & Data References
  const canvasRef = useRef(null);
  const viewportContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const textEditorRef = useRef(null);
  const currentRenderTaskRef = useRef(null);
  const renderSequenceRef = useRef(0);
  const pdfBytesRef = useRef(null);
  const fallbackPageSizesRef = useRef([]);

  // Dragging and resizing state
  const dragRef = useRef({
    isDragging: false,
    isResizing: false,
    annotationId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    originWidth: 0,
    originHeight: 0,
  });

  // ── History Helper: Record Snapshot ─────────────────────────────────────────
  const recordHistorySnapshot = useCallback(
    (newAnnotations) => {
      setHistoryStack((prev) => {
        const truncated = prev.slice(0, historyPointer + 1);
        return [...truncated, JSON.parse(JSON.stringify(newAnnotations))];
      });
      setHistoryPointer((prev) => prev + 1);
    },
    [historyPointer]
  );

  const handleUndo = useCallback(() => {
    if (historyPointer > 0) {
      const nextPointer = historyPointer - 1;
      setHistoryPointer(nextPointer);
      setAnnotationsByPage(JSON.parse(JSON.stringify(historyStack[nextPointer])));
      setSelectedAnnotationId(null);
    }
  }, [historyPointer, historyStack]);

  const handleRedo = useCallback(() => {
    if (historyPointer < historyStack.length - 1) {
      const nextPointer = historyPointer + 1;
      setHistoryPointer(nextPointer);
      setAnnotationsByPage(JSON.parse(JSON.stringify(historyStack[nextPointer])));
      setSelectedAnnotationId(null);
    }
  }, [historyPointer, historyStack]);

  // ── Mutation Helper: Update Annotations for Current Page ────────────────────
  const updateCurrentPageAnnotations = useCallback(
    (updater, recordHistory = true) => {
      setAnnotationsByPage((prev) => {
        const currentList = prev[currentPage] || [];
        const updatedList = typeof updater === "function" ? updater(currentList) : updater;
        const nextState = { ...prev, [currentPage]: updatedList };
        if (recordHistory) {
          recordHistorySnapshot(nextState);
        }
        return nextState;
      });
    },
    [currentPage, recordHistorySnapshot]
  );

  // ── Delete Selected Annotation ──────────────────────────────────────────────
  const deleteSelectedAnnotation = useCallback(() => {
    if (!selectedAnnotationId) return;
    updateCurrentPageAnnotations((prev) => prev.filter((a) => a.id !== selectedAnnotationId));
    setSelectedAnnotationId(null);
  }, [selectedAnnotationId, updateCurrentPageAnnotations]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (["INPUT", "TEXTAREA"].includes(e.target?.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedAnnotationId) {
          e.preventDefault();
          deleteSelectedAnnotation();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo, selectedAnnotationId, deleteSelectedAnnotation]);

  // Clean up Blob URLs to prevent memory leaks
  const cleanupBlobUrl = useCallback(() => {
    if (fileBlobUrl) {
      URL.revokeObjectURL(fileBlobUrl);
      setFileBlobUrl(null);
    }
    if (exportResult?.downloadUrl) {
      URL.revokeObjectURL(exportResult.downloadUrl);
      setExportResult(null);
    }
  }, [fileBlobUrl, exportResult]);

  useEffect(() => {
    return () => {
      if (fileBlobUrl) URL.revokeObjectURL(fileBlobUrl);
      if (exportResult?.downloadUrl) URL.revokeObjectURL(exportResult.downloadUrl);
      if (currentRenderTaskRef.current) {
        try {
          currentRenderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [fileBlobUrl, exportResult]);

  // ── Render Page using PDF.js (with clean white page fallback) ───────────────
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

    // If PDF.js visual renderer is unavailable, draw a clean white page surface
    // using the exact page dimensions read by pdf-lib so editing still works.
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

      // Paint white paper background prior to PDF page render
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

      if (seq === renderSequenceRef.current) {
        setIsRendering(false);
        currentRenderTaskRef.current = null;
      }
    } catch (err) {
      if (err?.name === "RenderingCancelledException") return;
      console.warn("Render execution warning:", err);
      if (seq === renderSequenceRef.current) {
        setIsRendering(false);
      }
    }
  }, []);

  // Automatically render whenever file/page/zoom changes and canvas is mounted
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
      setErrorMessage(null);
      cleanupBlobUrl();
      setAnnotationsByPage({});
      setHistoryStack([{}]);
      setHistoryPointer(0);
      setSelectedAnnotationId(null);
      setExportResult(null);

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

        // 2. Validate structure & extract page count/dimensions with pdf-lib
        // ignoreEncryption: true allows normal PDFs with owner-permission flags to open
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
                "This document is encrypted with a password. Please unlock before editing.",
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
            title: "Empty PDF Document",
            message: "This PDF does not contain any readable pages to edit.",
          });
          setFile(null);
          setPdfDocument(null);
          setPageCount(0);
          setIsLoadingPdf(false);
          return;
        }

        // Cache clean bytes and page dimensions from pdf-lib
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

        // 3. Load PDF.js document for high-resolution canvas preview
        // Isolated in its own try/catch so worker issues never falsely reject a valid PDF
        let loadedPdfJsDoc = null;
        try {
          const loadingTask = pdfjsLib.getDocument({
            data: pdfJsBytes,
          });
          loadedPdfJsDoc = await loadingTask.promise;
        } catch (pdfJsErr) {
          console.warn(
            "PDF.js preview worker fallback active; using pdf-lib page dimensions:",
            pdfJsErr
          );
          loadedPdfJsDoc = null;
        }

        const newBlobUrl = URL.createObjectURL(fileObj);
        setFileBlobUrl(newBlobUrl);
        setPdfDocument(loadedPdfJsDoc);
        setPageCount(totalPages);
        setCurrentPage(1);
        setFile(fileObj);
        setIsLoadingPdf(false);
      } catch (err) {
        console.error("Failed to load PDF:", err);
        setIsLoadingPdf(false);
        const msg = err?.message?.toLowerCase() || "";
        if (msg.includes("password") || msg.includes("encrypt")) {
          setErrorMessage({
            title: "Password-Protected PDF",
            message: "This document is encrypted with a password. Please unlock before editing.",
          });
        } else {
          setErrorMessage({
            title: "Corrupted or Unsupported Document",
            message: "Could not parse document structure. The file may be damaged or incomplete.",
          });
        }
        setFile(null);
        setPdfDocument(null);
        setPageCount(0);
      }
    },
    [cleanupBlobUrl]
  );

  // ── File Selection & Drag-and-Drop ──────────────────────────────────────────
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
          title: "Unsupported File Type",
          message: `"${fileName || "Selected file"}" is not a PDF. Please select a valid .pdf document.`,
        });
        return;
      }

      if (candidate.size === 0) {
        setErrorMessage({
          title: "Empty Document",
          message: "The selected file is 0 bytes and cannot be loaded.",
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

  useEffect(() => {
    if (location.state?.initialFiles && Array.isArray(location.state.initialFiles)) {
      const initial = location.state.initialFiles[0];
      if (initial instanceof File) {
        handleSelectFile(initial);
      }
    }
  }, [location.state, handleSelectFile]);

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
    cleanupBlobUrl();
    if (currentRenderTaskRef.current) {
      try {
        currentRenderTaskRef.current.cancel();
      } catch {
        // ignore
      }
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
    setAnnotationsByPage({});
    setHistoryStack([]);
    setHistoryPointer(-1);
    setSelectedAnnotationId(null);
    setExportResult(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Viewport Scale & Page Navigation ────────────────────────────────────────
  const changePage = (newPage) => {
    if (newPage < 1 || newPage > pageCount || newPage === currentPage) return;
    setCurrentPage(newPage);
    setSelectedAnnotationId(null);
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

  // ── Annotation Data Selectors ───────────────────────────────────────────────
  const currentPageAnnotations = useMemo(() => {
    return annotationsByPage[currentPage] || [];
  }, [annotationsByPage, currentPage]);

  const selectedAnnotation = useMemo(() => {
    if (!selectedAnnotationId) return null;
    return currentPageAnnotations.find((a) => a.id === selectedAnnotationId) || null;
  }, [currentPageAnnotations, selectedAnnotationId]);

  const totalAnnotationsCount = useMemo(() => {
    return Object.values(annotationsByPage).reduce((acc, list) => acc + (list?.length || 0), 0);
  }, [annotationsByPage]);

  // ── Add New Text Annotation ─────────────────────────────────────────────────
  const addTextAnnotationAt = (xPt, yPt) => {
    const newText = {
      id: generateAnnotationId(),
      type: "text",
      xPt: Math.max(0, Math.min(xPt, pageDimensions.width - 120)),
      yPt: Math.max(0, Math.min(yPt, pageDimensions.height - 40)),
      text: "Sample Text",
      fontSize: fontSize,
      color: textColor,
    };
    updateCurrentPageAnnotations((prev) => [...prev, newText]);
    setSelectedAnnotationId(newText.id);
    setActiveTool("select");

    // Focus the right-sidebar Content textarea so the user can type immediately
    setTimeout(() => {
      if (textEditorRef.current) {
        textEditorRef.current.focus();
        textEditorRef.current.select();
      }
    }, 30);
  };

  // ── Add New Image Annotation ────────────────────────────────────────────────
  const handleImageFilePicked = (e) => {
    const imgFile = e.target.files?.[0];
    if (!imgFile) return;

    if (!imgFile.type.startsWith("image/")) {
      setErrorMessage({
        title: "Unsupported Image File",
        message: "Please select a standard image format such as PNG, JPEG, or WebP.",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (!dataUrl) return;

      const img = new Image();
      img.onload = () => {
        const targetWidth = Math.min(180, pageDimensions.width * 0.4);
        const aspect = (img.height || 100) / (img.width || 100);
        const targetHeight = targetWidth * aspect;

        const newImage = {
          id: generateAnnotationId(),
          type: "image",
          xPt: (pageDimensions.width - targetWidth) / 2,
          yPt: (pageDimensions.height - targetHeight) / 2,
          widthPt: targetWidth,
          heightPt: targetHeight,
          dataUrl: dataUrl,
          mimeType: imgFile.type,
          filename: imgFile.name,
        };

        updateCurrentPageAnnotations((prev) => [...prev, newImage]);
        setSelectedAnnotationId(newImage.id);
        setActiveTool("select");
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(imgFile);
    e.target.value = "";
  };

  // ── Pointer Handlers on Overlay Plane (Drawing & Placement) ─────────────────
  const getPointerPointInPdfCoords = (e) => {
    const overlay = e.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    const xPt = screenX / zoomScale;
    const yPt = screenY / zoomScale;

    return { xPt, yPt };
  };

  const handleOverlayPointerDown = (e) => {
    if (isRendering) return;

    if (activeTool === "select") {
      if (e.target === e.currentTarget) {
        setSelectedAnnotationId(null);
      }
      return;
    }

    const { xPt, yPt } = getPointerPointInPdfCoords(e);

    if (activeTool === "text") {
      addTextAnnotationAt(xPt, yPt);
      return;
    }

    if (activeTool === "image") {
      imageInputRef.current?.click();
      return;
    }

    if (activeTool === "draw" || activeTool === "highlight") {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const isHighlight = activeTool === "highlight";
      const newStroke = {
        id: generateAnnotationId(),
        type: isHighlight ? "highlight" : "draw",
        color: isHighlight ? highlightColor : strokeColor,
        width: isHighlight ? highlightWidth : strokeWidth,
        opacity: isHighlight ? 0.45 : 1.0,
        points: [{ x: xPt, y: yPt }],
      };
      setCurrentStroke(newStroke);
      return;
    }

    if (activeTool === "eraser") {
      eraseStrokeAt(xPt, yPt);
    }
  };

  const handleOverlayPointerMove = (e) => {
    if (!currentStroke) {
      if (activeTool === "eraser" && e.buttons === 1) {
        const { xPt, yPt } = getPointerPointInPdfCoords(e);
        eraseStrokeAt(xPt, yPt);
      }
      return;
    }

    const { xPt, yPt } = getPointerPointInPdfCoords(e);
    setCurrentStroke((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        points: [...prev.points, { x: xPt, y: yPt }],
      };
    });
  };

  const handleOverlayPointerUp = () => {
    if (currentStroke) {
      const normalizedPoints =
        currentStroke.points.length === 1
          ? [
              currentStroke.points[0],
              {
                x: currentStroke.points[0].x + 0.5,
                y: currentStroke.points[0].y + 0.5,
              },
            ]
          : currentStroke.points;

      const completedStroke = {
        ...currentStroke,
        points: normalizedPoints,
      };
      updateCurrentPageAnnotations((prev) => [...prev, completedStroke]);
      setCurrentStroke(null);
    }
  };

  // ── Eraser Logic ────────────────────────────────────────────────────────────
  const eraseStrokeAt = (xPt, yPt) => {
    const thresholdPt = 16;
    updateCurrentPageAnnotations((prev) => {
      return prev.filter((item) => {
        if (item.type !== "draw" && item.type !== "highlight") return true;
        const hit = item.points.some((pt) => {
          const dx = pt.x - xPt;
          const dy = pt.y - yPt;
          return Math.sqrt(dx * dx + dy * dy) < thresholdPt;
        });
        return !hit;
      });
    }, true);
  };

  // ── Drag & Resize Handlers ──────────────────────────────────────────────────
  const startDragAnnotation = (e, annotation) => {
    e.stopPropagation();
    if (activeTool !== "select") {
      setActiveTool("select");
    }
    setSelectedAnnotationId(annotation.id);

    dragRef.current = {
      isDragging: true,
      isResizing: false,
      annotationId: annotation.id,
      startX: e.clientX,
      startY: e.clientY,
      originX: annotation.xPt,
      originY: annotation.yPt,
      originWidth: annotation.widthPt || 0,
      originHeight: annotation.heightPt || 0,
    };

    const handlePointerMove = (moveEvt) => {
      if (!dragRef.current.isDragging) return;
      const dxPt = (moveEvt.clientX - dragRef.current.startX) / zoomScale;
      const dyPt = (moveEvt.clientY - dragRef.current.startY) / zoomScale;

      const newX = Math.max(0, Math.min(dragRef.current.originX + dxPt, pageDimensions.width - 20));
      const newY = Math.max(
        0,
        Math.min(dragRef.current.originY + dyPt, pageDimensions.height - 20)
      );

      updateCurrentPageAnnotations(
        (prev) =>
          prev.map((a) =>
            a.id === dragRef.current.annotationId ? { ...a, xPt: newX, yPt: newY } : a
          ),
        false
      );
    };

    const handlePointerUp = () => {
      dragRef.current.isDragging = false;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      setAnnotationsByPage((latest) => {
        recordHistorySnapshot(latest);
        return latest;
      });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const startResizeAnnotation = (e, annotation) => {
    e.stopPropagation();
    dragRef.current = {
      isDragging: false,
      isResizing: true,
      annotationId: annotation.id,
      startX: e.clientX,
      startY: e.clientY,
      originWidth: annotation.widthPt,
      originHeight: annotation.heightPt,
      originX: annotation.xPt,
      originY: annotation.yPt,
    };

    const handleResizeMove = (moveEvt) => {
      if (!dragRef.current.isResizing) return;
      const dxPt = (moveEvt.clientX - dragRef.current.startX) / zoomScale;
      const newWidth = Math.max(40, dragRef.current.originWidth + dxPt);
      const aspect = dragRef.current.originHeight / dragRef.current.originWidth;
      const newHeight = newWidth * aspect;

      updateCurrentPageAnnotations(
        (prev) =>
          prev.map((a) =>
            a.id === dragRef.current.annotationId
              ? { ...a, widthPt: newWidth, heightPt: newHeight }
              : a
          ),
        false
      );
    };

    const handleResizeUp = () => {
      dragRef.current.isResizing = false;
      window.removeEventListener("pointermove", handleResizeMove);
      window.removeEventListener("pointerup", handleResizeUp);
      setAnnotationsByPage((latest) => {
        recordHistorySnapshot(latest);
        return latest;
      });
    };

    window.addEventListener("pointermove", handleResizeMove);
    window.addEventListener("pointerup", handleResizeUp);
  };

  const buildSvgPath = (points) => {
    if (!points || points.length === 0) return "";
    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y + 0.1}`;
    }
    return points.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
    }, "");
  };

  // ── STAGE 3: REAL PDF EXPORT ENGINE VIA pdf-lib ──────────────────────────────
  const handleExportPDF = async () => {
    if (!file || isExporting) return;

    setIsExporting(true);
    setExportProgressText("Preparing document structure...");
    setErrorMessage(null);

    try {
      setExportProgressText("Reading original PDF buffer...");
      const sourceBytes =
        pdfBytesRef.current || new Uint8Array(await file.arrayBuffer());

      // Load clean copy with ignoreEncryption: true so PDFs with owner flags export cleanly
      const pdfDoc = await PDFDocument.load(sourceBytes, {
        ignoreEncryption: true,
      });
      const pages = pdfDoc.getPages();
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      setExportProgressText("Embedding annotations into PDF pages...");

      // Iterate through each page and bake in its annotations
      for (let pIndex = 0; pIndex < pages.length; pIndex++) {
        const pageNum = pIndex + 1;
        const page = pages[pIndex];
        const pageAnnotations = annotationsByPage[pageNum] || [];
        const { height: pageHeight } = page.getSize();

        for (const item of pageAnnotations) {
          // 1. EMBED TEXT ANNOTATION
          if (item.type === "text") {
            const cleanText = sanitizeTextForPdf(item.text);
            if (!cleanText.trim()) continue;

            const pdfColor = hexToPdfRgb(item.color || "#0f172a", rgb);
            const size = item.fontSize || 16;
            // Match the 2px top / 6px left padding and baseline of the DOM preview box
            const targetX = item.xPt + 6;
            const targetY = pageHeight - item.yPt - size * 0.88 - 2;

            page.drawText(cleanText, {
              x: targetX,
              y: targetY,
              size: size,
              lineHeight: size * 1.25,
              font: helveticaFont,
              color: pdfColor,
            });
          }

          // 2. EMBED IMAGE ANNOTATION
          if (item.type === "image" && item.dataUrl) {
            let embeddedImg = null;
            try {
              if (item.dataUrl.includes("data:image/png")) {
                embeddedImg = await pdfDoc.embedPng(item.dataUrl);
              } else if (
                item.dataUrl.includes("data:image/jpeg") ||
                item.dataUrl.includes("data:image/jpg")
              ) {
                embeddedImg = await pdfDoc.embedJpg(item.dataUrl);
              } else {
                // Offscreen conversion for WebP or other formats
                const convertedPng = await new Promise((res) => {
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
                  offImg.src = item.dataUrl;
                });
                if (convertedPng) {
                  embeddedImg = await pdfDoc.embedPng(convertedPng);
                }
              }

              if (embeddedImg) {
                const targetY = pageHeight - item.yPt - item.heightPt;
                page.drawImage(embeddedImg, {
                  x: item.xPt,
                  y: targetY,
                  width: item.widthPt,
                  height: item.heightPt,
                });
              }
            } catch (imgErr) {
              console.warn("Could not embed image annotation:", imgErr);
            }
          }

          // 3. EMBED DRAWING & HIGHLIGHT VECTOR STROKES
          if ((item.type === "draw" || item.type === "highlight") && item.points?.length >= 1) {
            const strokeColorVal = hexToPdfRgb(item.color, rgb);
            const strokeOpacity = item.opacity || (item.type === "highlight" ? 0.45 : 1.0);
            const pts =
              item.points.length === 1
                ? [item.points[0], { x: item.points[0].x + 0.5, y: item.points[0].y + 0.5 }]
                : item.points;

            for (let i = 0; i < pts.length - 1; i++) {
              const p1 = pts[i];
              const p2 = pts[i + 1];

              page.drawLine({
                start: { x: p1.x, y: pageHeight - p1.y },
                end: { x: p2.x, y: pageHeight - p2.y },
                thickness: item.width,
                color: strokeColorVal,
                opacity: strokeOpacity,
              });
            }
          }
        }
      }

      setExportProgressText("Compiling final PDF byte stream...");
      const editedPdfBytes = await pdfDoc.save();
      const editedBlob = new Blob([editedPdfBytes], { type: "application/pdf" });
      const downloadUrl = URL.createObjectURL(editedBlob);

      const baseName = file.name.replace(/\.pdf$/i, "");
      const outputFilename = `${baseName}_edited.pdf`;

      setExportResult({
        downloadUrl,
        filename: outputFilename,
        size: editedBlob.size,
        annotationsCount: totalAnnotationsCount,
      });
    } catch (err) {
      console.error("PDF export failure:", err);
      setErrorMessage({
        title: "Export Failed",
        message:
          err?.message ||
          "Could not compile annotations into the document. Please check your annotations and try again.",
      });
    } finally {
      setIsExporting(false);
      setExportProgressText("");
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
              Edit PDF Workspace
            </h1>
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Stage 3: Full Export Engine
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>

            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              Open a PDF Document to Annotate & Export
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">
              Drag and drop your PDF here, or select from your local device. Add custom text, graphics,
              drawings, and highlighters, then export a permanently embedded PDF.
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

      {/* ── State 2: Active PDF Editor Workspace ─────────────────────────────── */}
      {file && (
        <div className="flex-1 flex flex-col min-h-0">
          <input
            type="file"
            ref={imageInputRef}
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={handleImageFilePicked}
          />

          {/* ── Top Editor Toolbar ───────────────────────────────────────────── */}
          <section className="bg-white border-b border-slate-200 px-3 sm:px-6 py-2 flex items-center justify-between gap-3 overflow-x-auto shadow-2xs shrink-0 scrollbar-thin">
            {/* Left: Active Tool Selection */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTool("select")}
                className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-all ${
                  activeTool === "select"
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                title="Select & Move (V)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                <span className="hidden sm:inline">Select</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTool("text");
                  setSelectedAnnotationId(null);
                }}
                className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-all ${
                  activeTool === "text"
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                title="Add Text (T)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M12 6v14m-4 0h8" />
                </svg>
                <span className="hidden sm:inline">Text</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTool("image");
                  imageInputRef.current?.click();
                }}
                className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-all ${
                  activeTool === "image"
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                title="Add Image Stamp"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="hidden sm:inline">Image</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTool("draw");
                  setSelectedAnnotationId(null);
                }}
                className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-all ${
                  activeTool === "draw"
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                title="Free Draw Pen"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <span className="hidden sm:inline">Draw</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTool("highlight");
                  setSelectedAnnotationId(null);
                }}
                className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-all ${
                  activeTool === "highlight"
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                title="Highlighter"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10M12 3l7 7-9 9-5-1 1-5 6-10z" />
                </svg>
                <span className="hidden sm:inline">Highlight</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTool("eraser");
                  setSelectedAnnotationId(null);
                }}
                className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-all ${
                  activeTool === "eraser"
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                title="Eraser"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="hidden sm:inline">Eraser</span>
              </button>

              <div className="h-5 w-px bg-slate-200 mx-1 hidden sm:block" />

              <button
                type="button"
                disabled={historyPointer <= 0}
                onClick={handleUndo}
                title="Undo (Ctrl+Z)"
                className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2m0 0l-3-3m3 3l3-3M3 10l3 3m-3-3l3-3" />
                </svg>
              </button>
              <button
                type="button"
                disabled={historyPointer >= historyStack.length - 1}
                onClick={handleRedo}
                title="Redo (Ctrl+Y)"
                className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v2m0 0l3-3m-3 3l-3-3m16-4l-3 3m3-3l-3-3" />
                </svg>
              </button>
            </div>

            {/* Right: Viewport Controls & STAGE 3 EXPORT BUTTON */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Page Navigator */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold text-slate-700">
                <button
                  type="button"
                  disabled={currentPage <= 1 || isRendering}
                  onClick={() => changePage(currentPage - 1)}
                  className="px-2 py-1 rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous Page"
                >
                  ‹
                </button>
                <span className="px-1.5 text-[11px] whitespace-nowrap">
                  {currentPage} / {pageCount || 1}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= pageCount || isRendering}
                  onClick={() => changePage(currentPage + 1)}
                  className="px-2 py-1 rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next Page"
                >
                  ›
                </button>
              </div>

              <div className="h-5 w-px bg-slate-200 hidden xs:block" />

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  disabled={zoomScale <= 0.5 || isRendering}
                  onClick={() => handleZoom(zoomScale - 0.25)}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600"
                  title="Zoom Out"
                  aria-label="Zoom Out"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                  </svg>
                </button>

                <span className="w-12 text-center font-bold text-slate-700 text-xs">
                  {Math.round(zoomScale * 100)}%
                </span>

                <button
                  type="button"
                  disabled={zoomScale >= 2.5 || isRendering}
                  onClick={() => handleZoom(zoomScale + 0.25)}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600"
                  title="Zoom In"
                  aria-label="Zoom In"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={handleFitToWidth}
                  className="hidden sm:inline-flex px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-semibold text-slate-600 transition-colors"
                  title="Fit to Width"
                >
                  Fit
                </button>
              </div>

              {/* STAGE 3: EXPORT PDF ACTION BUTTON */}
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={isExporting}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-xs font-semibold text-white inline-flex items-center gap-2 shadow-xs transition-all active:scale-[0.98] cursor-pointer"
                title="Bake and export PDF with annotations"
              >
                {isExporting ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>Export PDF</span>
                  </>
                )}
              </button>
            </div>
          </section>

          {/* ── Main Workspace Body: Canvas with Vector Overlay & Properties ── */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 bg-slate-200/70">
            {/* Central Canvas & Overlay Viewport (lg:col-span-9) */}
            <div
              ref={viewportContainerRef}
              className="lg:col-span-9 p-4 sm:p-6 overflow-auto flex items-center justify-center relative min-h-[460px]"
            >
              <div
                className="relative shadow-md rounded bg-white transition-all duration-75 inline-block"
                style={{
                  width: `${pageDimensions.width * zoomScale}px`,
                  height: `${pageDimensions.height * zoomScale}px`,
                }}
              >
                {/* 1. Base PDF.js Canvas */}
                <canvas
                  ref={canvasRef}
                  className={`block w-full h-full transition-opacity duration-150 pointer-events-none ${
                    isRendering ? "opacity-40" : "opacity-100"
                  }`}
                />

                {/* 2. Vector SVG Overlay for Vector Drawing & Highlighting */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox={`0 0 ${pageDimensions.width} ${pageDimensions.height}`}
                >
                  {currentPageAnnotations
                    .filter((a) => a.type === "draw" || a.type === "highlight")
                    .map((stroke) => (
                      <path
                        key={stroke.id}
                        d={buildSvgPath(stroke.points)}
                        stroke={stroke.color}
                        strokeWidth={stroke.width}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                        opacity={stroke.opacity}
                      />
                    ))}

                  {currentStroke && (
                    <path
                      d={buildSvgPath(currentStroke.points)}
                      stroke={currentStroke.color}
                      strokeWidth={currentStroke.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                      opacity={currentStroke.opacity}
                    />
                  )}
                </svg>

                {/* 3. Interactive DOM Layer for Text & Image Annotations */}
                <div
                  className={`absolute inset-0 overflow-hidden ${
                    activeTool === "draw" || activeTool === "highlight"
                      ? "cursor-crosshair"
                      : activeTool === "eraser"
                      ? "cursor-cell"
                      : activeTool === "text"
                      ? "cursor-text"
                      : "cursor-default"
                  }`}
                  style={{ touchAction: "none" }}
                  onPointerDown={handleOverlayPointerDown}
                  onPointerMove={handleOverlayPointerMove}
                  onPointerUp={handleOverlayPointerUp}
                >
                  {currentPageAnnotations
                    .filter((a) => a.type === "text" || a.type === "image")
                    .map((item) => {
                      const isSelected = selectedAnnotationId === item.id;
                      const leftPx = item.xPt * zoomScale;
                      const topPx = item.yPt * zoomScale;

                      if (item.type === "text") {
                        return (
                          <div
                            key={item.id}
                            onPointerDown={(e) => startDragAnnotation(e, item)}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setActiveTool("select");
                              setSelectedAnnotationId(item.id);
                              setTimeout(() => {
                                if (textEditorRef.current) {
                                  textEditorRef.current.focus();
                                  textEditorRef.current.select();
                                }
                              }, 20);
                            }}
                            className={`absolute select-none cursor-move transition-shadow ${
                              isSelected
                                ? "ring-2 ring-blue-500 rounded bg-blue-50/20 shadow-xs"
                                : "hover:ring-1 hover:ring-slate-300 rounded"
                            }`}
                            style={{
                              left: `${leftPx}px`,
                              top: `${topPx}px`,
                              fontSize: `${item.fontSize * zoomScale}px`,
                              color: item.color,
                              padding: "2px 6px",
                              lineHeight: 1.25,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            <span>{item.text}</span>
                          </div>
                        );
                      }

                      if (item.type === "image") {
                        const widthPx = item.widthPt * zoomScale;
                        const heightPx = item.heightPt * zoomScale;

                        return (
                          <div
                            key={item.id}
                            onPointerDown={(e) => startDragAnnotation(e, item)}
                            className={`absolute select-none cursor-move group ${
                              isSelected
                                ? "ring-2 ring-blue-500 shadow-md rounded"
                                : "hover:ring-1 hover:ring-slate-400 rounded"
                            }`}
                            style={{
                              left: `${leftPx}px`,
                              top: `${topPx}px`,
                              width: `${widthPx}px`,
                              height: `${heightPx}px`,
                            }}
                          >
                            <img
                              src={item.dataUrl}
                              alt={item.filename || "Annotation"}
                              className="w-full h-full object-contain pointer-events-none rounded"
                            />

                            {isSelected && (
                              <div
                                onPointerDown={(e) => startResizeAnnotation(e, item)}
                                className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-blue-600 border border-white rounded-full cursor-se-resize shadow-xs"
                                title="Drag to Resize"
                              />
                            )}
                          </div>
                        );
                      }
                      return null;
                    })}
                </div>

                {/* 4. Rendering / Exporting Progress Spinner Overlay */}
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

            {/* Right Column: Properties & Formatting Panel (lg:col-span-3) */}
            <aside className="lg:col-span-3 bg-white border-t lg:border-t-0 lg:border-l border-slate-200 p-5 space-y-5 overflow-y-auto">
              {/* Contextual Annotation Property Inspector */}
              {selectedAnnotation ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Selected {selectedAnnotation.type.toUpperCase()}
                    </h3>
                    <button
                      type="button"
                      onClick={deleteSelectedAnnotation}
                      className="px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                      title="Delete Annotation (Del)"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Delete</span>
                    </button>
                  </div>

                  {selectedAnnotation.type === "text" && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                          Content
                        </label>
                        <textarea
                          ref={textEditorRef}
                          rows={3}
                          value={selectedAnnotation.text}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateCurrentPageAnnotations((prev) =>
                              prev.map((a) => (a.id === selectedAnnotation.id ? { ...a, text: val } : a))
                            );
                          }}
                          className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                          Font Size ({selectedAnnotation.fontSize} pt)
                        </label>
                        <input
                          type="range"
                          min={10}
                          max={36}
                          step={1}
                          value={selectedAnnotation.fontSize}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            updateCurrentPageAnnotations((prev) =>
                              prev.map((a) => (a.id === selectedAnnotation.id ? { ...a, fontSize: val } : a))
                            );
                          }}
                          className="w-full"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1.5">
                          Text Color
                        </label>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {COLOR_PRESETS.map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              onClick={() => {
                                updateCurrentPageAnnotations((prev) =>
                                  prev.map((a) => (a.id === selectedAnnotation.id ? { ...a, color: c.value } : a))
                                );
                              }}
                              className={`w-6 h-6 rounded-full border border-slate-300 ${
                                selectedAnnotation.color === c.value ? "ring-2 ring-blue-500 ring-offset-1" : ""
                              }`}
                              style={{ backgroundColor: c.value }}
                              title={c.name}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedAnnotation.type === "image" && (
                    <div className="space-y-3">
                      <div>
                        <span className="text-[11px] text-slate-500 font-medium block">File Name</span>
                        <p className="text-xs font-semibold text-slate-800 truncate">
                          {selectedAnnotation.filename || "Image Stamp"}
                        </p>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                          Width ({Math.round(selectedAnnotation.widthPt)} pt)
                        </label>
                        <input
                          type="range"
                          min={40}
                          max={Math.round(pageDimensions.width * 0.9)}
                          value={Math.round(selectedAnnotation.widthPt)}
                          onChange={(e) => {
                            const newW = parseInt(e.target.value, 10);
                            const aspect = selectedAnnotation.heightPt / selectedAnnotation.widthPt;
                            updateCurrentPageAnnotations((prev) =>
                              prev.map((a) =>
                                a.id === selectedAnnotation.id
                                  ? { ...a, widthPt: newW, heightPt: newW * aspect }
                                  : a
                              )
                            );
                          }}
                          className="w-full"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-100">
                    Tool Settings: {activeTool.toUpperCase()}
                  </h3>

                  {activeTool === "draw" && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1.5">
                          Stroke Color
                        </label>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {COLOR_PRESETS.map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              onClick={() => setStrokeColor(c.value)}
                              className={`w-6 h-6 rounded-full border border-slate-300 ${
                                strokeColor === c.value ? "ring-2 ring-blue-500 ring-offset-1" : ""
                              }`}
                              style={{ backgroundColor: c.value }}
                              title={c.name}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                          Stroke Width ({strokeWidth} px)
                        </label>
                        <input
                          type="range"
                          min={1}
                          max={12}
                          value={strokeWidth}
                          onChange={(e) => setStrokeWidth(parseInt(e.target.value, 10))}
                          className="w-full"
                        />
                      </div>
                    </div>
                  )}

                  {activeTool === "highlight" && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1.5">
                          Highlighter Tint
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {HIGHLIGHT_COLOR_PRESETS.map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              onClick={() => setHighlightColor(c.value)}
                              className={`w-7 h-7 rounded-lg border border-slate-300 ${
                                highlightColor === c.value ? "ring-2 ring-blue-500 ring-offset-1" : ""
                              }`}
                              style={{ backgroundColor: c.value }}
                              title={c.name}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                          Thickness ({highlightWidth} pt)
                        </label>
                        <input
                          type="range"
                          min={10}
                          max={32}
                          value={highlightWidth}
                          onChange={(e) => setHighlightWidth(parseInt(e.target.value, 10))}
                          className="w-full"
                        />
                      </div>
                    </div>
                  )}

                  {activeTool === "text" && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Click anywhere on the document canvas to place a new text annotation.
                      </p>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1.5">
                          Default Color
                        </label>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {COLOR_PRESETS.map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              onClick={() => setTextColor(c.value)}
                              className={`w-6 h-6 rounded-full border border-slate-300 ${
                                textColor === c.value ? "ring-2 ring-blue-500 ring-offset-1" : ""
                              }`}
                              style={{ backgroundColor: c.value }}
                              title={c.name}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTool === "eraser" && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 leading-relaxed space-y-1">
                      <span className="font-bold text-slate-800 block">Eraser Active</span>
                      <p>
                        Click or drag across pen strokes or highlighter marks on Page {currentPage} to
                        remove them.
                      </p>
                    </div>
                  )}

                  {activeTool === "select" && (
                    <div className="text-xs text-slate-500 leading-relaxed space-y-2">
                      <p>Click any annotation on the canvas to inspect, drag, resize, or delete it.</p>
                      <p className="text-[11px] text-slate-400">
                        Shortcuts: <kbd className="bg-slate-100 px-1 py-0.5 rounded">Ctrl+Z</kbd> (Undo),{" "}
                        <kbd className="bg-slate-100 px-1 py-0.5 rounded">Del</kbd> (Remove).
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Total Annotations & Layer Counter */}
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-bold text-slate-700">Document Annotations</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-semibold border border-blue-200/60">
                    {totalAnnotationsCount} total
                  </span>
                </div>

                {currentPageAnnotations.length > 0 ? (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {currentPageAnnotations.map((anno, index) => (
                      <div
                        key={anno.id}
                        onClick={() => {
                          setActiveTool("select");
                          setSelectedAnnotationId(anno.id);
                        }}
                        className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                          selectedAnnotationId === anno.id
                            ? "bg-blue-50 border border-blue-200 text-blue-900 font-semibold"
                            : "hover:bg-slate-50 text-slate-600 border border-transparent"
                        }`}
                      >
                        <span className="truncate">
                          #{index + 1} {anno.type.toUpperCase()}{" "}
                          {anno.type === "text" ? `("${anno.text.substring(0, 14)}...")` : ""}
                        </span>
                        <span className="text-[10px] text-slate-400 uppercase font-mono">
                          {anno.type}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No annotations on Page {currentPage}.</p>
                )}
              </div>

              {/* Document Overview */}
              <div className="pt-4 border-t border-slate-100 text-xs space-y-1.5">
                <span className="font-bold text-slate-400 uppercase tracking-wider block text-[11px]">
                  Document Information
                </span>
                <p className="font-semibold text-slate-900 truncate" title={file.name}>
                  {file.name}
                </p>
                <div className="flex justify-between text-slate-500">
                  <span>Size:</span>
                  <span className="font-medium text-slate-700">{formatBytes(file.size)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Dimensions:</span>
                  <span className="font-medium text-slate-700">
                    {pageDimensions.width} × {pageDimensions.height} pt
                  </span>
                </div>
              </div>

              {/* Quick Jump Page Thumbnails / Buttons */}
              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Jump to Page
                </h4>
                <div className="grid grid-cols-5 gap-1.5 max-h-36 overflow-y-auto p-0.5">
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((num) => (
                    <button
                      key={num}
                      type="button"
                      disabled={isRendering}
                      onClick={() => changePage(num)}
                      className={`min-h-[28px] rounded text-xs font-semibold transition-colors ${
                        currentPage === num
                          ? "bg-blue-600 text-white shadow-2xs"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>

          {/* ── STAGE 3: EXPORT SUCCESS NOTIFICATION MODAL ─────────────────────── */}
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
                    <h3 className="text-base font-bold text-slate-900">PDF Export Complete</h3>
                    <p className="text-xs text-slate-500">
                      Annotations embedded permanently into document bytes.
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
                    <span className="text-slate-500">Annotations Baked:</span>
                    <span className="font-semibold text-emerald-600">{exportResult.annotationsCount}</span>
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