import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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

// ── Resilient Dynamic PDF.js Loader & Worker Setup ────────────────────────────
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

// ── Real Backend AI Request Dispatcher ───────────────────────────────────────
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");
const AI_API_ENDPOINT = `${API_BASE_URL}/api/ai/analyze`;

async function requestBackendAI({ action, prompt, documentText, fileName, pageCount, chatHistory }) {
  const token = localStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Cap document payload to ~120,000 characters to stay within safe payload limits
  const sanitizedText = (documentText || "").slice(0, 120000);

  const backendActionMap = {
  summary: "summary",
  keypoints: "keyPoints",
  keyPoints: "keyPoints",
  qa: "question",
  question: "question",
  detailed: "detailedAnalysis",
  detailedAnalysis: "detailedAnalysis",
};

const payload = {
  action: backendActionMap[action] || action,
  prompt: prompt || "",
  documentText: sanitizedText,
  fileName,
  pageCount,
  chatHistory: chatHistory || [],
};

  const response = await fetch(AI_API_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errMessage = `AI Service returned HTTP ${response.status}`;
    try {
      const data = await response.json();
      if (data.message) errMessage = data.message;
    } catch {
      if (response.status === 404) {
        errMessage = `Backend endpoint '${AI_API_ENDPOINT}' not found (HTTP 404). Backend AI route is not yet connected.`;
      }
    }
    throw new Error(errMessage);
  }

  const data = await response.json();
  const resultText = data.result || data.reply || data.summary || data.analysis || data.message;
  if (!resultText) {
    throw new Error("The AI backend responded, but no text content was returned in the payload.");
  }

  return resultText;
}

export default function AIAnalysis() {
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

  // Extracted Document Text & Stats
  const [extractedText, setExtractedText] = useState("");
  const [extractingText, setExtractingText] = useState(false);
  const [textStats, setTextStats] = useState({ words: 0, characters: 0, hasScannedWarning: false });

  // AI Tabs State: 'summary' | 'keypoints' | 'qa' | 'detailed' | 'info'
  const [activeTab, setActiveTab] = useState("summary");

  // Analysis Content State
  const [summaryData, setSummaryData] = useState("");
  const [keyPointsData, setKeyPointsData] = useState([]);
  const [detailedData, setDetailedData] = useState("");
  const [chatMessages, setChatMessages] = useState([]); // [{ id, sender: 'user'|'ai', text, time, error }]
  const [inputQuestion, setInputQuestion] = useState("");

  // Loading & Error States for AI operations
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [copiedStatus, setCopiedStatus] = useState("");

  // References
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const pdfDocRef = useRef(null);
  const chatBottomRef = useRef(null);

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

  // Scroll chat into view when new messages arrive
  useEffect(() => {
    if (activeTab === "qa" && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, activeTab]);

  // ── Document & Text Loader ──────────────────────────────────────────────────
  const loadPDFDocument = useCallback(async (fileObj) => {
    setLoadingDoc(true);
    setDocError(null);
    setAiError(null);
    setSummaryData("");
    setKeyPointsData([]);
    setDetailedData("");
    setChatMessages([]);
    setExtractedText("");

    try {
      if (!fileObj.name.toLowerCase().endsWith(".pdf") && fileObj.type !== "application/pdf") {
        throw new Error("Invalid file format. Please upload a valid PDF document (.pdf).");
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

      // Extract all text stream items asynchronously
      extractFullDocumentText(doc);
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

  // Check forwarded initial files from Dashboard
  useEffect(() => {
    if (location.state?.initialFiles && location.state.initialFiles.length > 0) {
      const initial = location.state.initialFiles[0];
      loadPDFDocument(initial);
    }
  }, [location.state, loadPDFDocument]);

  // Extract all text from PDF for real AI processing
  const extractFullDocumentText = async (doc) => {
    setExtractingText(true);
    try {
      let accumulated = "";
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((it) => it.str).join(" ");
        if (pageText.trim()) {
          accumulated += `\n[Page ${p}]\n` + pageText.trim() + "\n";
        }
      }

      const cleanText = accumulated.trim();
      const wordCount = cleanText ? cleanText.split(/\s+/).filter(Boolean).length : 0;
      const charCount = cleanText.length;
      const isScanned = charCount === 0;

      setExtractedText(cleanText);
      setTextStats({
        words: wordCount,
        characters: charCount,
        hasScannedWarning: isScanned,
      });

      if (isScanned) {
        setDocError(
          "No extractable text was detected in this PDF. It appears to be an image-only or scanned photocopy PDF. AI analysis requires character text; OCR is not yet connected."
        );
      }
    } catch (err) {
      console.error("Text extraction failed:", err);
      setDocError("Failed to extract readable text streams from this PDF.");
    } finally {
      setExtractingText(false);
    }
  };

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

      const baseScale = (zoom / 100) * 1.25;
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
    setExtractedText("");
    setTextStats({ words: 0, characters: 0, hasScannedWarning: false });
    setSummaryData("");
    setKeyPointsData([]);
    setDetailedData("");
    setChatMessages([]);
    setDocError(null);
    setAiError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── AI Request Triggers (Real Execution Only) ───────────────────────────────
  const handleGenerateSummary = async () => {
    if (!extractedText || aiLoading) return;
    setAiLoading(true);
    setAiError(null);

    try {
      const result = await requestBackendAI({
        action: "summary",
        prompt: "Provide a clear, executive-level summary of this document.",
        documentText: extractedText,
        fileName: file.name,
        pageCount: numPages,
      });
      setSummaryData(result);
    } catch (err) {
      setAiError(err.message || "Failed to generate summary from AI endpoint.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerateKeyPoints = async () => {
    if (!extractedText || aiLoading) return;
    setAiLoading(true);
    setAiError(null);

    try {
      const result = await requestBackendAI({
        action: "keypoints",
        prompt: "Extract the most critical findings, data points, and key takeaways as a bullet list.",
        documentText: extractedText,
        fileName: file.name,
        pageCount: numPages,
      });

      // Split bullet points cleanly
      const points = result
        .split(/\r?\n/)
        .map((p) => p.replace(/^[-*•\d.]+\s*/, "").trim())
        .filter(Boolean);

      setKeyPointsData(points);
    } catch (err) {
      setAiError(err.message || "Failed to extract key points from AI endpoint.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerateDetailedAnalysis = async () => {
    if (!extractedText || aiLoading) return;
    setAiLoading(true);
    setAiError(null);

    try {
      const result = await requestBackendAI({
        action: "detailed",
        prompt:
          "Provide a structured, deep analytical breakdown of this document including Methodology, Findings, and Risks/Opportunities.",
        documentText: extractedText,
        fileName: file.name,
        pageCount: numPages,
      });
      setDetailedData(result);
    } catch (err) {
      setAiError(err.message || "Failed to generate detailed analysis.");
    } finally {
      setAiLoading(false);
    }
  };

  // ── Chat / Ask Questions ────────────────────────────────────────────────────
  const handleSendQuestion = async () => {
    const question = inputQuestion.trim();
    if (!question || aiLoading || !extractedText) return;

    const userMsgId = Date.now().toString();
    const newChatHistory = [
      ...chatMessages,
      { id: userMsgId, sender: "user", text: question, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
    ];

    setChatMessages(newChatHistory);
    setInputQuestion("");
    setAiLoading(true);
    setAiError(null);

    try {
      const aiReply = await requestBackendAI({
        action: "qa",
        prompt: question,
        documentText: extractedText,
        fileName: file.name,
        pageCount: numPages,
        chatHistory: newChatHistory.map((m) => ({ role: m.sender, content: m.text })),
      });

      setChatMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: "ai",
          text: aiReply,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: "ai",
          text: `Error: ${err.message}`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          error: true,
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleKeyDownQuestion = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
  };

  // ── Copy Helper ─────────────────────────────────────────────────────────────
  const copyToClipboard = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedStatus(label);
    setTimeout(() => setCopiedStatus(""), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 antialiased selection:bg-purple-100 selection:text-purple-900">
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
            <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate">
                AI Document Analysis
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-500 hidden sm:block truncate">
                Summarize, extract key takeaways, and chat with your PDF
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
        {/* Document Notice Banner */}
        {docError && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-3 shadow-xs">
            <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div className="flex-1 text-sm">
              <p className="font-semibold text-red-900">Document Inspection Notice</p>
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
                  ? "border-purple-500 bg-purple-50/50 scale-[1.01]"
                  : "border-slate-300 hover:border-purple-400 hover:bg-slate-50/60"
              }`}
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-5 shadow-inner">
                <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
                Analyze Any Document with AI
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-6">
                Drag and drop your PDF here, or browse files. Extract summaries, extract key takeaways, and chat directly with your document.
              </p>

              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm shadow-md transition-all active:scale-[0.98]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>Upload PDF Document</span>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Client-side text parsing
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
                  Interactive Q&amp;A Chat
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── LOADED STATE: Two-Column Workspace ───────────────────────────── */}
        {file && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ── LEFT COLUMN: PDF Preview & Info (5 cols on Desktop) ──────── */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* Document Overview Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate max-w-xs" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatBytes(file.size)} &bull; {numPages} {numPages === 1 ? "page" : "pages"} &bull;{" "}
                      {extractingText ? "Parsing text..." : `${textStats.words.toLocaleString()} words`}
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
                  <span className="font-semibold text-slate-700">Document Reader</span>
                  {numPages > 0 && (
                    <span>
                      Page {currentPage} of {numPages}
                    </span>
                  )}
                </div>

                <div className="relative min-h-[340px] max-h-[500px] bg-slate-100/70 rounded-xl overflow-auto p-4 flex items-center justify-center border border-slate-200/60 my-3">
                  {renderingPreview && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-2xs flex flex-col items-center justify-center z-10">
                      <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
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
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                      onChange={(e) => setCurrentPage(parseInt(e.target.value, 10))}
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
                    onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
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

            {/* ── RIGHT COLUMN: AI Analysis Studio (7 cols on Desktop) ────── */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              {/* Studio Card with Navigation Tabs */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col min-h-[580px]">
                {/* Navigation Tabs Header */}
                <div className="flex items-center border-b border-slate-200/80 bg-slate-50/70 p-1.5 overflow-x-auto gap-1">
                  {[
                    { id: "summary", label: "Summary" },
                    { id: "keypoints", label: "Key Points" },
                    { id: "qa", label: "Ask Questions" },
                    { id: "detailed", label: "Detailed Analysis" },
                    { id: "info", label: "Doc Info" },
                  ].map((tab) => {
                    const isSelected = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-3.5 py-2 text-xs font-semibold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                          isSelected
                            ? "bg-white text-purple-700 shadow-2xs border border-slate-200/80"
                            : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* AI Error Notification Banner */}
                {aiError && (
                  <div className="m-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs shadow-2xs">
                    <div className="flex items-start gap-2.5">
                      <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <div className="flex-1">
                        <p className="font-bold text-amber-950">AI Backend Notice</p>
                        <p className="mt-1 text-amber-800 leading-normal">{aiError}</p>
                        <p className="mt-2 text-[11px] text-amber-700 bg-amber-100/60 p-2 rounded-lg">
                          <strong>Developer Note:</strong> The frontend extracted {textStats.words.toLocaleString()} words from this PDF and called <code className="font-mono bg-white px-1 py-0.5 rounded border border-amber-300">POST /api/ai/analyze</code>. To receive live model outputs, configure your Express backend route with your Gemini or OpenAI API key.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB 1: Document Summary ──────────────────────────────── */}
                {activeTab === "summary" && (
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">Executive Document Summary</h3>
                          <p className="text-xs text-slate-500">Concise overview of core concepts and narrative</p>
                        </div>
                        {summaryData && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(summaryData, "summary")}
                            className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 cursor-pointer"
                          >
                            {copiedStatus === "summary" ? "Copied!" : "Copy Summary"}
                          </button>
                        )}
                      </div>

                      {summaryData ? (
                        <div className="p-4 bg-slate-50/70 border border-slate-200/60 rounded-xl text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                          {summaryData}
                        </div>
                      ) : (
                        <div className="py-16 text-center text-slate-400">
                          <svg className="w-10 h-10 mx-auto mb-3 text-purple-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.53-4.5h7.5M8.25 9.75h4.5" />
                          </svg>
                          <p className="font-semibold text-slate-600">No summary generated yet</p>
                          <p className="text-xs mt-1">Click the button below to generate a concise summary from this document.</p>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-slate-100 mt-6">
                      <button
                        type="button"
                        onClick={handleGenerateSummary}
                        disabled={aiLoading || !extractedText}
                        className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-[0.99] disabled:opacity-50 text-white font-semibold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {aiLoading ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Analyzing document...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                            </svg>
                            <span>{summaryData ? "Regenerate Summary" : "Generate Summary"}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── TAB 2: Key Points ────────────────────────────────────── */}
                {activeTab === "keypoints" && (
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">Key Points &amp; Takeaways</h3>
                          <p className="text-xs text-slate-500">Critical findings distilled into bullet points</p>
                        </div>
                        {keyPointsData.length > 0 && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(keyPointsData.join("\n• "), "keypoints")}
                            className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 cursor-pointer"
                          >
                            {copiedStatus === "keypoints" ? "Copied!" : "Copy Points"}
                          </button>
                        )}
                      </div>

                      {keyPointsData.length > 0 ? (
                        <div className="space-y-2.5">
                          {keyPointsData.map((pt, idx) => (
                            <div key={idx} className="p-3 bg-purple-50/40 border border-purple-100 rounded-xl flex items-start gap-3">
                              <div className="w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                {idx + 1}
                              </div>
                              <p className="text-xs sm:text-sm text-slate-800 leading-normal">{pt}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-16 text-center text-slate-400">
                          <svg className="w-10 h-10 mx-auto mb-3 text-purple-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                          </svg>
                          <p className="font-semibold text-slate-600">No key takeaways extracted yet</p>
                          <p className="text-xs mt-1">Extract main ideas and important facts as bullet points.</p>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-slate-100 mt-6">
                      <button
                        type="button"
                        onClick={handleGenerateKeyPoints}
                        disabled={aiLoading || !extractedText}
                        className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-[0.99] disabled:opacity-50 text-white font-semibold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {aiLoading ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Distilling takeaways...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                            </svg>
                            <span>{keyPointsData.length > 0 ? "Regenerate Key Points" : "Extract Key Points"}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── TAB 3: Ask Questions (Chat Interface) ────────────────── */}
                {activeTab === "qa" && (
                  <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Document Q&amp;A Chat</h3>
                        <p className="text-xs text-slate-500">Ask any question grounded in this document</p>
                      </div>
                      {chatMessages.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setChatMessages([])}
                          className="text-xs font-semibold text-slate-500 hover:text-red-600 cursor-pointer"
                        >
                          Clear Chat
                        </button>
                      )}
                    </div>

                    {/* Messages Scroll Area */}
                    <div className="flex-1 overflow-y-auto max-h-[360px] space-y-3 pr-1 my-2">
                      {chatMessages.length === 0 ? (
                        <div className="py-12 text-center text-slate-400">
                          <svg className="w-8 h-8 mx-auto mb-2 text-purple-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v5.998z" />
                          </svg>
                          <p className="text-xs font-semibold text-slate-600">No questions asked yet</p>
                          <p className="text-[11px] text-slate-400 mt-1">Try one of the suggested prompts below or type your own question.</p>

                          {/* Prompt Starters */}
                          <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-md mx-auto">
                            {[
                              "What is the main objective of this document?",
                              "Who are the key people or organizations mentioned?",
                              "What are the final conclusions or recommendations?",
                            ].map((suggestion, sIdx) => (
                              <button
                                key={sIdx}
                                type="button"
                                onClick={() => setInputQuestion(suggestion)}
                                className="px-2.5 py-1.5 text-[11px] rounded-lg bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors text-left cursor-pointer"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        chatMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
                          >
                            <div
                              className={`max-w-[85%] p-3 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                                msg.sender === "user"
                                  ? "bg-purple-600 text-white rounded-br-xs"
                                  : msg.error
                                  ? "bg-red-50 text-red-800 border border-red-200 rounded-bl-xs"
                                  : "bg-slate-100 text-slate-800 rounded-bl-xs border border-slate-200/60"
                              }`}
                            >
                              <p className="whitespace-pre-line">{msg.text}</p>
                            </div>
                            <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.time}</span>
                          </div>
                        ))
                      )}
                      <div ref={chatBottomRef} />
                    </div>

                    {/* Question Input */}
                    <div className="pt-3 border-t border-slate-100">
                      <div className="relative flex items-center">
                        <textarea
                          rows={2}
                          value={inputQuestion}
                          onChange={(e) => setInputQuestion(e.target.value)}
                          onKeyDown={handleKeyDownQuestion}
                          placeholder="Ask a question about this document... (Enter to send)"
                          disabled={aiLoading || !extractedText}
                          className="w-full pl-3 pr-24 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none resize-none transition-all"
                        />
                        <button
                          type="button"
                          onClick={handleSendQuestion}
                          disabled={!inputQuestion.trim() || aiLoading || !extractedText}
                          className="absolute right-2 px-3 py-1.5 min-h-[36px] bg-purple-600 hover:bg-purple-700 active:scale-[0.98] disabled:opacity-40 text-white text-xs font-semibold rounded-lg shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                        >
                          {aiLoading ? (
                            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <span>Ask</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB 4: Detailed Analysis ─────────────────────────────── */}
                {activeTab === "detailed" && (
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">Structured Analytical Breakdown</h3>
                          <p className="text-xs text-slate-500">Methodology, evaluation, and implications</p>
                        </div>
                        {detailedData && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(detailedData, "detailed")}
                            className="text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 cursor-pointer"
                          >
                            {copiedStatus === "detailed" ? "Copied!" : "Copy Report"}
                          </button>
                        )}
                      </div>

                      {detailedData ? (
                        <div className="p-4 bg-slate-50/70 border border-slate-200/60 rounded-xl text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line max-h-[380px] overflow-y-auto">
                          {detailedData}
                        </div>
                      ) : (
                        <div className="py-16 text-center text-slate-400">
                          <svg className="w-10 h-10 mx-auto mb-3 text-purple-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                          </svg>
                          <p className="font-semibold text-slate-600">No in-depth report generated</p>
                          <p className="text-xs mt-1">Request an exhaustive breakdown of document methodology, risks, and findings.</p>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-slate-100 mt-6">
                      <button
                        type="button"
                        onClick={handleGenerateDetailedAnalysis}
                        disabled={aiLoading || !extractedText}
                        className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-[0.99] disabled:opacity-50 text-white font-semibold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {aiLoading ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Synthesizing deep report...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.25 2.25L15 7.5" />
                            </svg>
                            <span>{detailedData ? "Regenerate Deep Analysis" : "Run In-Depth Analysis"}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── TAB 5: Document Information ──────────────────────────── */}
                {activeTab === "info" && (
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="pb-3 border-b border-slate-100 mb-4">
                        <h3 className="text-sm font-bold text-slate-900">Document Text Analytics</h3>
                        <p className="text-xs text-slate-500">Character, word, and density metadata extracted from PDF</p>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                          <p className="text-[11px] font-semibold text-slate-400">Total Pages</p>
                          <p className="text-base font-bold text-slate-900 mt-1">{numPages}</p>
                        </div>
                        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                          <p className="text-[11px] font-semibold text-slate-400">Total Words</p>
                          <p className="text-base font-bold text-slate-900 mt-1">
                            {textStats.words.toLocaleString()}
                          </p>
                        </div>
                        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                          <p className="text-[11px] font-semibold text-slate-400">Characters</p>
                          <p className="text-base font-bold text-slate-900 mt-1">
                            {textStats.characters.toLocaleString()}
                          </p>
                        </div>
                        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                          <p className="text-[11px] font-semibold text-slate-400">Avg Words/Page</p>
                          <p className="text-base font-bold text-slate-900 mt-1">
                            {numPages > 0 ? Math.round(textStats.words / numPages) : 0}
                          </p>
                        </div>
                        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                          <p className="text-[11px] font-semibold text-slate-400">File Size</p>
                          <p className="text-base font-bold text-slate-900 mt-1">{formatBytes(file.size)}</p>
                        </div>
                        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                          <p className="text-[11px] font-semibold text-slate-400">Text Density</p>
                          <p className="text-xs font-bold text-purple-700 mt-1">
                            {textStats.words > 1000
                              ? "High (Prose Heavy)"
                              : textStats.words > 100
                              ? "Moderate"
                              : "Low (Images/Diagrams)"}
                          </p>
                        </div>
                      </div>

                      {/* Text Snippet Preview */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-1.5 text-xs">
                          <span className="font-semibold text-slate-700">Extracted Text Stream Sample</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(extractedText, "extracted")}
                            className="text-purple-600 hover:text-purple-700 font-semibold cursor-pointer"
                          >
                            {copiedStatus === "extracted" ? "Copied All Text!" : "Copy Full Text"}
                          </button>
                        </div>
                        <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl font-mono text-[11px] text-slate-600 max-h-[160px] overflow-y-auto whitespace-pre-wrap">
                          {extractedText.slice(0, 1500) || "No text extracted."}
                          {extractedText.length > 1500 && "..."}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}