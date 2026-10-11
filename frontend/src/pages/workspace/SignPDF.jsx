import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SignatureCanvas from "react-signature-canvas";
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

// ── Unique ID Generator ──────────────────────────────────────────────────────
function generatePlacementId() {
  return `sig_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ── Pure Canvas Transparent Bounding-Box Trimmer for Drawn Signatures ────────
function extractTrimmedSignature(sourceCanvas) {
  if (!sourceCanvas) return null;
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const ctx = sourceCanvas.getContext("2d");
  if (!ctx || width === 0 || height === 0) {
    return {
      dataUrl: sourceCanvas.toDataURL("image/png"),
      aspect: 0.4,
    };
  }

  const imageData = ctx.getImageData(0, 0, width, height).data;
  let top = height;
  let left = width;
  let right = 0;
  let bottom = 0;
  let foundInk = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = imageData[(y * width + x) * 4 + 3];
      if (alpha > 10) {
        foundInk = true;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (!foundInk) {
    return {
      dataUrl: sourceCanvas.toDataURL("image/png"),
      aspect: 0.4,
    };
  }

  const pad = 8;
  const cropLeft = Math.max(0, left - pad);
  const cropTop = Math.max(0, top - pad);
  const cropWidth = Math.min(width - cropLeft, right - cropLeft + 1 + pad * 2);
  const cropHeight = Math.min(height - cropTop, bottom - cropTop + 1 + pad * 2);

  const trimmed = document.createElement("canvas");
  trimmed.width = Math.max(1, cropWidth);
  trimmed.height = Math.max(1, cropHeight);
  const trimmedCtx = trimmed.getContext("2d");
  trimmedCtx.drawImage(
    sourceCanvas,
    cropLeft,
    cropTop,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );

  return {
    dataUrl: trimmed.toDataURL("image/png"),
    aspect: Math.max(0.15, Math.min(1.5, trimmed.height / trimmed.width)),
  };
}

// ── Ink Color Presets ────────────────────────────────────────────────────────
const INK_COLORS = [
  { name: "Black Ink", value: "#0f172a" },
  { name: "Classic Navy", value: "#1e3a8a" },
  { name: "Crimson Red", value: "#dc2626" },
];

export default function SignPDF() {
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

  // ── Signature Creation State ────────────────────────────────────────────────
  // Mode: "draw" | "upload" | "type"
  const [signatureMode, setSignatureMode] = useState("draw");
  const [penColor, setPenColor] = useState("#0f172a");
  const [penWidth, setPenWidth] = useState(2.5);
  const [typedName, setTypedName] = useState("");

  // Confirmed Active Signature Stamp: { dataUrl: string, aspect: number }
  const [activeSignatureStamp, setActiveSignatureStamp] = useState(null);

  // Placements Collection: Placement[]
  // Placement = { id, pageNum, xPt, yPt, widthPt, heightPt, dataUrl }
  const [placements, setPlacements] = useState([]);
  const [selectedPlacementId, setSelectedPlacementId] = useState(null);

  // ── Export Processing State ─────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgressText, setExportProgressText] = useState("");
  const [exportResult, setExportResult] = useState(null);

  // DOM & Data References
  const canvasRef = useRef(null);
  const viewportContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageSigInputRef = useRef(null);
  const sigCanvasRef = useRef(null);
  const currentRenderTaskRef = useRef(null);
  const renderSequenceRef = useRef(0);
  const pdfBytesRef = useRef(null);
  const fallbackPageSizesRef = useRef([]);
  const fileBlobUrlRef = useRef(null);
  const exportUrlRef = useRef(null);

  // Dragging and resizing reference
  const dragRef = useRef({
    isDragging: false,
    isResizing: false,
    placementId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    originWidth: 0,
    originHeight: 0,
  });

  // ── Memory Cleanup Without Cancelling Active Renders ────────────────────────
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

  // Unmount-only cleanup so state updates never cancel an active canvas render
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

  // Automatically render when <canvas ref={canvasRef} /> is mounted and page/zoom changes
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
      setPlacements([]);
      setSelectedPlacementId(null);

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
                "This document is encrypted with a password. Please remove encryption before signing.",
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
            message: "This PDF does not contain any readable pages to sign.",
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

        // 3. Load PDF.js document for live canvas rendering
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
        console.error("Failed to load PDF in SignPDF:", err);
        setIsLoadingPdf(false);
        setIsRendering(false);
        const msg = err?.message?.toLowerCase() || "";
        if (msg.includes("password") || msg.includes("encrypt")) {
          setErrorMessage({
            title: "Password-Protected PDF",
            message:
              "This document is encrypted with a password. Please remove encryption before signing.",
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

  // ── Handle Selected File & Validation ───────────────────────────────────────
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
          message: "The selected file is 0 bytes and cannot be signed.",
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
    setPlacements([]);
    setSelectedPlacementId(null);
    setActiveSignatureStamp(null);
    setErrorMessage(null);
    setExportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (imageSigInputRef.current) imageSigInputRef.current.value = "";
  };

  // ── Page & Zoom Controls ────────────────────────────────────────────────────
  const changePage = (newPage) => {
    if (newPage < 1 || newPage > pageCount || newPage === currentPage) return;
    setCurrentPage(newPage);
    setSelectedPlacementId(null);
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

  // ── Confirm Drawn Signature from Pad ────────────────────────────────────────
  const handleConfirmDrawnSignature = () => {
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      setErrorMessage({
        title: "Empty Signature",
        message: "Please draw your signature inside the box before confirming.",
      });
      return;
    }

    try {
      const rawCanvas =
        typeof sigCanvasRef.current.getCanvas === "function"
          ? sigCanvasRef.current.getCanvas()
          : null;
      const trimmed = extractTrimmedSignature(rawCanvas);
      if (trimmed?.dataUrl) {
        setActiveSignatureStamp(trimmed);
        setErrorMessage(null);
        return;
      }
    } catch {
      // Fallback to direct dataURL below
    }

    const dataUrl = sigCanvasRef.current.toDataURL("image/png");
    setActiveSignatureStamp({ dataUrl, aspect: 0.4 });
    setErrorMessage(null);
  };

  const handleClearSignaturePad = () => {
    sigCanvasRef.current?.clear();
  };

  // ── Handle Uploaded Signature Image ─────────────────────────────────────────
  const handleSignatureImageUploaded = (e) => {
    const imgFile = e.target.files?.[0];
    if (!imgFile) return;

    if (!imgFile.type.startsWith("image/")) {
      setErrorMessage({
        title: "Unsupported Image File",
        message: "Please choose a PNG or JPEG image of your signature.",
      });
      return;
    }

    if (imgFile.size > 10 * 1024 * 1024) {
      setErrorMessage({
        title: "File Exceeds Size Limit",
        message: "Signature image size should be under 10 MB.",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result;
      if (!dataUrl) return;

      const img = new Image();
      img.onload = () => {
        const aspect = (img.height || 100) / (img.width || 250);
        setActiveSignatureStamp({ dataUrl, aspect });
        setErrorMessage(null);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(imgFile);
    e.target.value = "";
  };

  // ── Generate Typed Cursive Signature ────────────────────────────────────────
  const handleConfirmTypedSignature = () => {
    if (!typedName || !typedName.trim()) {
      setErrorMessage({
        title: "No Name Entered",
        message: "Please type your full name to generate a signature stamp.",
      });
      return;
    }

    const offscreen = document.createElement("canvas");
    offscreen.width = 600;
    offscreen.height = 200;
    const ctx = offscreen.getContext("2d");

    ctx.clearRect(0, 0, offscreen.width, offscreen.height);
    ctx.font = "italic 64px 'Brush Script MT', cursive, sans-serif";
    ctx.fillStyle = penColor;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(typedName.trim(), 300, 100);

    const trimmed = extractTrimmedSignature(offscreen);
    if (trimmed?.dataUrl) {
      setActiveSignatureStamp(trimmed);
    } else {
      const dataUrl = offscreen.toDataURL("image/png");
      setActiveSignatureStamp({ dataUrl, aspect: 200 / 600 });
    }
    setErrorMessage(null);
  };

  // ── Place Signature on Active Page ──────────────────────────────────────────
  const placeSignatureOnCurrentPage = (customPtX, customPtY) => {
    if (!activeSignatureStamp) {
      setErrorMessage({
        title: "No Signature Created",
        message: "Please draw, type, or upload a signature first.",
      });
      return;
    }

    // Default width is 150pt, height computed via aspect ratio
    const widthPt = Math.min(160, pageDimensions.width * 0.4);
    const heightPt = widthPt * (activeSignatureStamp.aspect || 0.4);

    const targetX =
      customPtX !== undefined
        ? Math.max(0, Math.min(customPtX - widthPt / 2, pageDimensions.width - widthPt))
        : (pageDimensions.width - widthPt) / 2;

    const targetY =
      customPtY !== undefined
        ? Math.max(0, Math.min(customPtY - heightPt / 2, pageDimensions.height - heightPt))
        : (pageDimensions.height - heightPt) * 0.75; // Lower quadrant default

    const newPlacement = {
      id: generatePlacementId(),
      pageNum: currentPage,
      xPt: targetX,
      yPt: targetY,
      widthPt: widthPt,
      heightPt: heightPt,
      aspect: activeSignatureStamp.aspect || 0.4,
      dataUrl: activeSignatureStamp.dataUrl,
    };

    setPlacements((prev) => [...prev, newPlacement]);
    setSelectedPlacementId(newPlacement.id);
  };

  // Delete Placement
  const deletePlacement = (id) => {
    setPlacements((prev) => prev.filter((p) => p.id !== id));
    if (selectedPlacementId === id) setSelectedPlacementId(null);
  };

  // Clear All Placements with confirmation
  const handleClearAllPlacements = () => {
    if (window.confirm("Remove all signatures from this document?")) {
      setPlacements([]);
      setSelectedPlacementId(null);
    }
  };

  // ── Drag & Resize Placements on the Live Canvas ─────────────────────────────
  const startDragPlacement = (e, placement) => {
    e.stopPropagation();
    setSelectedPlacementId(placement.id);

    dragRef.current = {
      isDragging: true,
      isResizing: false,
      placementId: placement.id,
      startX: e.clientX,
      startY: e.clientY,
      originX: placement.xPt,
      originY: placement.yPt,
      originWidth: placement.widthPt,
      originHeight: placement.heightPt,
    };

    const handlePointerMove = (moveEvt) => {
      if (!dragRef.current.isDragging) return;
      const dxPt = (moveEvt.clientX - dragRef.current.startX) / zoomScale;
      const dyPt = (moveEvt.clientY - dragRef.current.startY) / zoomScale;

      const newX = Math.max(
        0,
        Math.min(dragRef.current.originX + dxPt, pageDimensions.width - 20)
      );
      const newY = Math.max(
        0,
        Math.min(dragRef.current.originY + dyPt, pageDimensions.height - 20)
      );

      setPlacements((prev) =>
        prev.map((p) =>
          p.id === dragRef.current.placementId ? { ...p, xPt: newX, yPt: newY } : p
        )
      );
    };

    const handlePointerUp = () => {
      dragRef.current.isDragging = false;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const startResizePlacement = (e, placement) => {
    e.stopPropagation();
    dragRef.current = {
      isDragging: false,
      isResizing: true,
      placementId: placement.id,
      startX: e.clientX,
      startY: e.clientY,
      originWidth: placement.widthPt,
      originHeight: placement.heightPt,
      originX: placement.xPt,
      originY: placement.yPt,
    };

    const handleResizeMove = (moveEvt) => {
      if (!dragRef.current.isResizing) return;
      const dxPt = (moveEvt.clientX - dragRef.current.startX) / zoomScale;
      const newWidth = Math.max(50, dragRef.current.originWidth + dxPt);
      const newHeight = newWidth * (placement.aspect || 0.4);

      setPlacements((prev) =>
        prev.map((p) =>
          p.id === dragRef.current.placementId
            ? { ...p, widthPt: newWidth, heightPt: newHeight }
            : p
        )
      );
    };

    const handleResizeUp = () => {
      dragRef.current.isResizing = false;
      window.removeEventListener("pointermove", handleResizeMove);
      window.removeEventListener("pointerup", handleResizeUp);
    };

    window.addEventListener("pointermove", handleResizeMove);
    window.addEventListener("pointerup", handleResizeUp);
  };

  // Current page placements
  const currentPagePlacements = useMemo(() => {
    return placements.filter((p) => p.pageNum === currentPage);
  }, [placements, currentPage]);

  const selectedPlacement = useMemo(() => {
    return placements.find((p) => p.id === selectedPlacementId) || null;
  }, [placements, selectedPlacementId]);

  // ── REAL CLIENT-SIDE PDF EXPORT VIA pdf-lib ──────────────────────────────────
  const handleExportSignedPDF = async () => {
    if (!file || isExporting) return;

    if (placements.length === 0) {
      setErrorMessage({
        title: "No Signatures Placed",
        message: "Please place at least one signature on the document before exporting.",
      });
      return;
    }

    setIsExporting(true);
    setExportProgressText("Loading document into signature engine...");
    setErrorMessage(null);

    try {
      const sourceBytes =
        pdfBytesRef.current || new Uint8Array(await file.arrayBuffer());
      const pdfDoc = await PDFDocument.load(sourceBytes, {
        ignoreEncryption: true,
      });
      const pages = pdfDoc.getPages();

      setExportProgressText("Embedding signatures into document pages...");

      // Cache embedded images to avoid redundant byte decoding
      const embeddedImageCache = new Map();

      for (const item of placements) {
        if (item.pageNum < 1 || item.pageNum > pages.length) continue;
        const page = pages[item.pageNum - 1];
        const { height: pHeight } = page.getSize();

        let embeddedImg = embeddedImageCache.get(item.dataUrl);
        if (!embeddedImg) {
          if (item.dataUrl.includes("data:image/png")) {
            embeddedImg = await pdfDoc.embedPng(item.dataUrl);
          } else if (
            item.dataUrl.includes("data:image/jpeg") ||
            item.dataUrl.includes("data:image/jpg")
          ) {
            embeddedImg = await pdfDoc.embedJpg(item.dataUrl);
          } else {
            // Offscreen PNG conversion
            const pngConverted = await new Promise((res) => {
              const offImg = new Image();
              offImg.onload = () => {
                const offCanvas = document.createElement("canvas");
                offCanvas.width = offImg.width;
                offCanvas.height = offImg.height;
                const ctx = offCanvas.getContext("2d");
                ctx.drawImage(offImg, 0, 0);
                res(offCanvas.toDataURL("image/png"));
              };
              offImg.onerror = () => res(null);
              offImg.src = item.dataUrl;
            });
            if (pngConverted) {
              embeddedImg = await pdfDoc.embedPng(pngConverted);
            }
          }
          if (embeddedImg) {
            embeddedImageCache.set(item.dataUrl, embeddedImg);
          }
        }

        if (embeddedImg) {
          // Screen coordinates top-left to PDF coordinates bottom-left
          const targetX = item.xPt;
          const targetY = pHeight - item.yPt - item.heightPt;

          page.drawImage(embeddedImg, {
            x: targetX,
            y: targetY,
            width: item.widthPt,
            height: item.heightPt,
          });
        }
      }

      setExportProgressText("Compiling signed PDF document...");
      const signedPdfBytes = await pdfDoc.save();
      const signedBlob = new Blob([signedPdfBytes], { type: "application/pdf" });

      if (exportUrlRef.current) {
        URL.revokeObjectURL(exportUrlRef.current);
      }
      const downloadUrl = URL.createObjectURL(signedBlob);
      exportUrlRef.current = downloadUrl;

      const baseName = file.name.replace(/\.pdf$/i, "");
      const outputFilename = `${baseName}-signed.pdf`;

      setExportResult({
        downloadUrl,
        filename: outputFilename,
        size: signedBlob.size,
        placementsCount: placements.length,
      });
    } catch (err) {
      console.error("PDF signature export error:", err);
      setErrorMessage({
        title: "Export Failed",
        message:
          err?.message ||
          "An unexpected error occurred while generating the signed PDF.",
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
              Sign PDF Workspace
            </h1>
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
              Visual Signature
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </div>

            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              Open a PDF Document to Sign
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">
              Drag and drop your PDF here, or select from your local drive. Draw, type, or upload your
              signature and place it on any page.
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

      {/* ── State 2: Active Workspace with Preview & Signature Controls ───────── */}
      {file && (
        <div className="flex-1 flex flex-col min-h-0">
          <input
            type="file"
            ref={imageSigInputRef}
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={handleSignatureImageUploaded}
          />

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

                {/* Place Stamp Button Shortcut */}
                {activeSignatureStamp && (
                  <button
                    type="button"
                    onClick={() => placeSignatureOnCurrentPage()}
                    className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Place on Page {currentPage}</span>
                  </button>
                )}

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

              {/* Document Container with Placed Signatures Overlay */}
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

                {/* 2. Placed Signatures Overlay for Active Page */}
                <div
                  className="absolute inset-0 overflow-hidden pointer-events-auto"
                  onClick={(e) => {
                    // Click empty area on the page overlay to place active signature stamp
                    if (e.target === e.currentTarget && activeSignatureStamp) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickXPt = (e.clientX - rect.left) / zoomScale;
                      const clickYPt = (e.clientY - rect.top) / zoomScale;
                      placeSignatureOnCurrentPage(clickXPt, clickYPt);
                    }
                  }}
                >
                  {currentPagePlacements.map((placement) => {
                    const isSelected = selectedPlacementId === placement.id;
                    const leftPx = placement.xPt * zoomScale;
                    const topPx = placement.yPt * zoomScale;
                    const widthPx = placement.widthPt * zoomScale;
                    const heightPx = placement.heightPt * zoomScale;

                    return (
                      <div
                        key={placement.id}
                        onPointerDown={(e) => startDragPlacement(e, placement)}
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute select-none cursor-move transition-shadow ${
                          isSelected
                            ? "ring-2 ring-blue-600 shadow-md bg-blue-50/10 rounded"
                            : "hover:ring-1 hover:ring-blue-400 rounded"
                        }`}
                        style={{
                          left: `${leftPx}px`,
                          top: `${topPx}px`,
                          width: `${widthPx}px`,
                          height: `${heightPx}px`,
                        }}
                      >
                        <img
                          src={placement.dataUrl}
                          alt="Signature"
                          className="w-full h-full object-contain pointer-events-none"
                        />

                        {/* Top-Right Delete Badge */}
                        {isSelected && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePlacement(placement.id);
                            }}
                            className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-xs cursor-pointer"
                            title="Remove Signature"
                          >
                            ×
                          </button>
                        )}

                        {/* Bottom-Right Resize Handle */}
                        {isSelected && (
                          <div
                            onPointerDown={(e) => startResizePlacement(e, placement)}
                            className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-blue-600 border border-white rounded-full cursor-se-resize shadow-xs"
                            title="Drag to resize"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Loading Spinner */}
                {(isRendering || isExporting) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-2xs rounded pointer-events-none">
                    <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-md text-xs font-semibold text-slate-700">
                      <svg className="w-4 h-4 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>{exportProgressText || `Rendering Page ${currentPage}...`}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Signature Creator & Placements Manager (5 Cols) */}
            <aside className="lg:col-span-5 bg-white border-t lg:border-t-0 lg:border-l border-slate-200 p-5 space-y-5 overflow-y-auto">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Visual Signature Tools</h3>
                <p className="text-xs text-slate-500">Create your signature and place it onto document pages.</p>
              </div>

              {/* Signature Mode Tabs */}
              <div className="flex p-1 bg-slate-100 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setSignatureMode("draw")}
                  className={`flex-1 min-h-[34px] text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    signatureMode === "draw"
                      ? "bg-white text-blue-600 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Draw
                </button>
                <button
                  type="button"
                  onClick={() => setSignatureMode("type")}
                  className={`flex-1 min-h-[34px] text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    signatureMode === "type"
                      ? "bg-white text-blue-600 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Type
                </button>
                <button
                  type="button"
                  onClick={() => setSignatureMode("upload")}
                  className={`flex-1 min-h-[34px] text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    signatureMode === "upload"
                      ? "bg-white text-blue-600 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Upload Image
                </button>
              </div>

              {/* ── Mode 1: Draw Signature Pad ────────────────────────────────── */}
              {signatureMode === "draw" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase">
                      Ink Color & Thickness
                    </span>
                    <div className="flex items-center gap-1.5">
                      {INK_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setPenColor(c.value)}
                          className={`w-5 h-5 rounded-full border border-slate-300 ${
                            penColor === c.value ? "ring-2 ring-blue-500 ring-offset-1" : ""
                          }`}
                          style={{ backgroundColor: c.value }}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Canvas Pad */}
                  <div className="relative border-2 border-dashed border-slate-300 rounded-2xl bg-white overflow-hidden p-1">
                    <SignatureCanvas
                      ref={sigCanvasRef}
                      penColor={penColor}
                      minWidth={penWidth}
                      maxWidth={penWidth + 1}
                      canvasProps={{
                        className: "w-full h-36 touch-none bg-white rounded-xl",
                      }}
                    />
                    <div className="absolute bottom-2 left-3 text-[10px] text-slate-400 pointer-events-none">
                      Sign above with finger, stylus, or mouse
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleClearSignaturePad}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDrawnSignature}
                      className="flex-1 min-h-[36px] px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
                    >
                      Confirm Signature
                    </button>
                  </div>
                </div>
              )}

              {/* ── Mode 2: Type Cursive Signature ────────────────────────────── */}
              {signatureMode === "type" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                      Type Your Name
                    </label>
                    <input
                      type="text"
                      value={typedName}
                      onChange={(e) => setTypedName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full text-xs font-semibold p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {typedName && (
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-center">
                      <span
                        className="text-3xl italic"
                        style={{ fontFamily: "'Brush Script MT', cursive, sans-serif", color: penColor }}
                      >
                        {typedName}
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleConfirmTypedSignature}
                    className="w-full min-h-[36px] px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
                  >
                    Confirm Typed Signature
                  </button>
                </div>
              )}

              {/* ── Mode 3: Upload Image Signature ────────────────────────────── */}
              {signatureMode === "upload" && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => imageSigInputRef.current?.click()}
                    className="w-full p-6 rounded-2xl border-2 border-dashed border-slate-300 hover:border-blue-400 text-center text-xs font-semibold text-blue-600 bg-blue-50/20 cursor-pointer"
                  >
                    + Choose PNG or JPEG Signature Image
                  </button>
                  <p className="text-[11px] text-slate-400 text-center">
                    Transparent PNG signatures produce the cleanest results on documents.
                  </p>
                </div>
              )}

              {/* Active Signature Stamp Preview Card */}
              {activeSignatureStamp && (
                <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-blue-900 uppercase">
                      Ready to Place
                    </span>
                    <button
                      type="button"
                      onClick={() => placeSignatureOnCurrentPage()}
                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                    >
                      + Place on Page {currentPage}
                    </button>
                  </div>

                  <div className="h-16 bg-white rounded-lg border border-slate-200 p-1 flex items-center justify-center">
                    <img
                      src={activeSignatureStamp.dataUrl}
                      alt="Active Signature"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Click anywhere on the document canvas or press "+ Place on Page {currentPage}".
                  </p>
                </div>
              )}

              {/* ── Placements Manager ────────────────────────────────────────── */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">Document Placements</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">
                    {placements.length} total
                  </span>
                </div>

                {placements.length > 0 ? (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {placements.map((p, idx) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          if (p.pageNum !== currentPage) changePage(p.pageNum);
                          setSelectedPlacementId(p.id);
                        }}
                        className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer border transition-colors ${
                          selectedPlacementId === p.id
                            ? "bg-blue-50 border-blue-300 text-blue-900 font-semibold"
                            : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[11px] font-mono text-slate-400">#{idx + 1}</span>
                          <span className="truncate">Page {p.pageNum}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePlacement(p.id);
                            }}
                            className="text-red-500 hover:text-red-700 p-1"
                            title="Delete"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No signatures placed yet.</p>
                )}

                {/* Selected Placement Size Slider */}
                {selectedPlacement && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600 uppercase">
                      <span>Adjust Size</span>
                      <span>{Math.round(selectedPlacement.widthPt)} pt</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={Math.round(pageDimensions.width * 0.7)}
                      value={Math.round(selectedPlacement.widthPt)}
                      onChange={(e) => {
                        const newW = parseInt(e.target.value, 10);
                        const newH = newW * (selectedPlacement.aspect || 0.4);
                        setPlacements((prev) =>
                          prev.map((item) =>
                            item.id === selectedPlacement.id
                              ? { ...item, widthPt: newW, heightPt: newH }
                              : item
                          )
                        );
                      }}
                      className="w-full"
                    />
                  </div>
                )}

                {placements.length > 1 && (
                  <button
                    type="button"
                    onClick={handleClearAllPlacements}
                    className="text-xs text-red-500 hover:text-red-700 underline block cursor-pointer"
                  >
                    Remove All Signatures
                  </button>
                )}
              </div>

              {/* ── Export Action Button ──────────────────────────────────────── */}
              <div className="pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleExportSignedPDF}
                  disabled={isExporting || placements.length === 0}
                  className="w-full min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  {isExporting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>{exportProgressText || "Signing Document..."}</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>Export Signed PDF ({placements.length})</span>
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
                    <h3 className="text-base font-bold text-slate-900">Document Signed Successfully</h3>
                    <p className="text-xs text-slate-500">
                      Visual signatures baked permanently into document pages.
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
                    <span className="text-slate-500">Signatures Applied:</span>
                    <span className="font-semibold text-emerald-600">{exportResult.placementsCount}</span>
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