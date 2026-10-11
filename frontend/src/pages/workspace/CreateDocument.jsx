import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// ── Starter Document Templates ───────────────────────────────────────────────
const DOCUMENT_TEMPLATES = [
  {
    id: "blank",
    title: "Blank Document",
    description: "Start from scratch with a clean, unformatted canvas.",
    badge: "Clean Slate",
    defaultDocTitle: "Untitled Document",
    content: "<p>Start typing your document here...</p>",
  },
  {
    id: "letter",
    title: "Professional Letter",
    description: "Formal letter format with sender, date, recipient, and sign-off.",
    badge: "Business",
    defaultDocTitle: "Formal Business Letter",
    content: `
      <p><strong>[Your Name]</strong><br>[Your Title or Organization]<br>[Your Street Address]<br>[City, State, Zip Code]<br>[Your Email Address] | [Your Phone Number]</p>
      <p><br></p>
      <p><em>[Date: ${new Date().toLocaleDateString(undefined, { dateStyle: "long" })}]</em></p>
      <p><br></p>
      <p><strong>[Recipient Name]</strong><br>[Recipient Title]<br>[Company / Organization Name]<br>[Company Address]<br>[City, State, Zip Code]</p>
      <p><br></p>
      <p>Dear [Recipient Name],</p>
      <p><br></p>
      <p><strong>Subject: [Clear, Professional Subject Line]</strong></p>
      <p><br></p>
      <p>I am writing to formally communicate regarding [purpose of your letter]. [Provide necessary background context, operational details, or core objectives in this opening paragraph].</p>
      <p>[Detail the core proposals, evidence, key requirements, or specific questions in this second paragraph. Ensure all points are stated with clarity and professional courtesy].</p>
      <p>Thank you for your time, consideration, and prompt attention to this matter. I welcome the opportunity to discuss this further and look forward to your response.</p>
      <p><br></p>
      <p>Sincerely,</p>
      <p><br></p>
      <p><strong>[Your Name]</strong><br>[Your Title]</p>
    `,
  },
  {
    id: "report",
    title: "Simple Report",
    description: "Structured report with executive summary, findings, and recommendations.",
    badge: "Academic / Work",
    defaultDocTitle: "Project Status Report",
    content: `
      <h1>Project &amp; Operational Report</h1>
      <p><em>Prepared by: [Author Name] &bull; Date: ${new Date().toLocaleDateString(undefined, { dateStyle: "long" })} &bull; Version 1.0</em></p>
      <hr>
      <h2>1. Executive Summary</h2>
      <p>This report provides a concise synthesis of key findings, strategic observations, and progress benchmarks regarding [Project Name]. Over the observed evaluation cycle, core milestones have progressed satisfactorily.</p>
      <h2>2. Objectives &amp; Scope</h2>
      <p>The primary objectives of this initiative include:</p>
      <ul>
        <li>Establish a dependable, streamlined document creation workflow.</li>
        <li>Eliminate friction across drafting, formatting, and file exports.</li>
        <li>Ensure responsive usability across mobile, tablet, and desktop devices.</li>
      </ul>
      <h2>3. Key Findings &amp; Analysis</h2>
      <p>Based on our systematic review and team feedback, the following critical observations were highlighted:</p>
      <ol>
        <li><strong>Operational Efficiency:</strong> Standardized templates reduce initial drafting time by approximately 40%.</li>
        <li><strong>Accessibility:</strong> High-contrast typography and native keyboard shortcuts enhance long-form reading comfort.</li>
        <li><strong>Portability:</strong> Multi-format export ensures seamless sharing across text, Word, and PDF pipelines.</li>
      </ol>
      <h2>4. Recommendations &amp; Next Steps</h2>
      <p>We recommend immediate adoption of these standards and scheduling a follow-up review milestone upon completion of the initial deployment.</p>
    `,
  },
  {
    id: "meeting",
    title: "Meeting Notes",
    description: "Meeting agenda, attendees, discussion highlights, and action items.",
    badge: "Productivity",
    defaultDocTitle: "Team Meeting Notes",
    content: `
      <h1>Team Meeting Notes: [Project / Topic]</h1>
      <p><strong>Date &amp; Time:</strong> ${new Date().toLocaleDateString()} at 10:00 AM &bull; <strong>Location:</strong> [Online / Conference Room A]</p>
      <p><strong>Facilitator:</strong> [Meeting Lead] &bull; <strong>Note Taker:</strong> [Your Name]</p>
      <p><strong>Attendees:</strong> [Participant 1], [Participant 2], [Participant 3]</p>
      <hr>
      <h2>Agenda Overview</h2>
      <ul>
        <li>Weekly milestone recap and progress evaluation</li>
        <li>Architecture review and dependency minimization</li>
        <li>Blockers, dependencies, and upcoming releases</li>
      </ul>
      <h2>Discussion Highlights</h2>
      <p><strong>Topic 1: Workspace Feature Deployment</strong><br>The engineering team confirmed that the Document Creator works standalone with client-side draft auto-saving and zero external bundle requirements.</p>
      <p><strong>Topic 2: Cross-Platform Layout</strong><br>Reviewed touch targets and formatting controls to ensure full responsiveness down to 320px screen widths.</p>
      <h2>Action Items &amp; Ownership</h2>
      <ul>
        <li><strong>[Owner 1]:</strong> Finalize responsive testing across tablet and mobile viewports.</li>
        <li><strong>[Owner 2]:</strong> Review DOCX and PDF export styling fidelity.</li>
        <li><strong>[Owner 3]:</strong> Schedule integration checkpoint for the upcoming Dashboard release.</li>
      </ul>
    `,
  },
  {
    id: "study",
    title: "Study Notes",
    description: "Organized lecture or study notes with core concepts, breakdown, and checklist.",
    badge: "Learning",
    defaultDocTitle: "Study Notes & Summary",
    content: `
      <h1>Study Notes: [Subject / Topic Name]</h1>
      <p><em>Module / Chapter: [Unit 1] &bull; Date: ${new Date().toLocaleDateString(undefined, { dateStyle: "long" })}</em></p>
      <hr>
      <h2>1. Core Concepts &amp; Definitions</h2>
      <p><strong>Fundamental Concept 1:</strong> [State the primary rule, definition, or axiom here].</p>
      <p><strong>Fundamental Concept 2:</strong> [Explain the secondary principle and its relationship to the primary concept].</p>
      <h2>2. Detailed Breakdown &amp; Analysis</h2>
      <ul>
        <li><strong>Key Idea A:</strong> Essential mechanisms and structural behavior.</li>
        <li><strong>Key Idea B:</strong> Common edge cases, exceptions, and practical nuances.</li>
        <li><strong>Key Idea C:</strong> Critical mathematical formulas, code patterns, or historical context.</li>
      </ul>
      <h2>3. Self-Assessment &amp; Review Checklist</h2>
      <ol>
        <li>Can I explain this concept clearly to someone else without referring back to notes?</li>
        <li>What are the top three differences between this topic and related modules?</li>
        <li>How does this principle apply to practical, real-world scenarios?</li>
      </ol>
    `,
  },
];

// LocalStorage Draft Key
const DRAFT_STORAGE_KEY = "ai_doc_workspace_draft_v1";

export default function CreateDocument() {
  const navigate = useNavigate();

  // Document states
  const [docTitle, setDocTitle] = useState("Untitled Document");
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  // Active toolbar formatting state (for button active styling)
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    ul: false,
    ol: false,
    h1: false,
    h2: false,
    h3: false,
  });

  // UI Modals & Dropdown states
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isConfirmTemplateOpen, setIsConfirmTemplateOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isCloudNoticeOpen, setIsCloudNoticeOpen] = useState(false);
  const [saveToast, setSaveToast] = useState("");

  const editorRef = useRef(null);
  const exportMenuRef = useRef(null);

  // ── Stats Calculator (Words & Characters) ──────────────────────────────────
  const updateStats = useCallback(() => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || "";
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    setWordCount(words);
    setCharCount(text.length);
  }, []);

  // ── Format State Inspector ─────────────────────────────────────────────────
  const checkActiveFormats = useCallback(() => {
    if (typeof document === "undefined") return;
    try {
      setActiveFormats({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikeThrough: document.queryCommandState("strikeThrough"),
        ul: document.queryCommandState("insertUnorderedList"),
        ol: document.queryCommandState("insertOrderedList"),
        h1: document.queryCommandValue("formatBlock").toLowerCase() === "h1",
        h2: document.queryCommandValue("formatBlock").toLowerCase() === "h2",
        h3: document.queryCommandValue("formatBlock").toLowerCase() === "h3",
      });
    } catch {}
  }, []);

  // ── Auto-save Draft to LocalStorage ─────────────────────────────────────────
  const saveDraftLocally = useCallback(() => {
    if (!editorRef.current) return;
    const draftData = {
      title: docTitle,
      content: editorRef.current.innerHTML,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData));
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setLastSavedTime(timeStr);
      setIsDirty(false);
      setSaveToast(`Draft saved locally at ${timeStr}`);
      setTimeout(() => setSaveToast(""), 3000);
    } catch (e) {
      console.warn("Unable to save draft to localStorage:", e);
    }
  }, [docTitle]);

  // Load existing draft or default blank template on initial mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.content && editorRef.current) {
          editorRef.current.innerHTML = parsed.content;
          setDocTitle(parsed.title || "Untitled Document");
          if (parsed.savedAt) {
            setLastSavedTime(
              new Date(parsed.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            );
          }
          updateStats();
          return;
        }
      }
    } catch {}

    // Default to blank template
    if (editorRef.current) {
      editorRef.current.innerHTML = DOCUMENT_TEMPLATES[0].content;
      updateStats();
    }
  }, [updateStats]);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // ── Editor Command Dispatcher ──────────────────────────────────────────────
  const executeCmd = (command, value = null) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    checkActiveFormats();
    updateStats();
    setIsDirty(true);
  };

  const handleHeadingChange = (e) => {
    const val = e.target.value;
    if (val === "p") {
      executeCmd("formatBlock", "<p>");
    } else {
      executeCmd("formatBlock", `<${val}>`);
    }
  };

  // ── Template Selection Handlers ────────────────────────────────────────────
  const applyTemplate = (template) => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = template.content;
    setDocTitle(template.defaultDocTitle);
    updateStats();
    setIsDirty(true);
    setIsTemplateModalOpen(false);
    setIsConfirmTemplateOpen(false);
    setPendingTemplate(null);
  };

  const handleSelectTemplate = (template) => {
    if (isDirty) {
      setPendingTemplate(template);
      setIsConfirmTemplateOpen(true);
    } else {
      applyTemplate(template);
    }
  };

  const handleClearEditor = () => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = "<p><br></p>";
    setDocTitle("Untitled Document");
    updateStats();
    setIsDirty(true);
    setIsConfirmClearOpen(false);
  };

  // ── Keyboard Shortcuts ─────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveDraftLocally();
    }
  };

  // ── Export 1: Plain Text (.txt) ────────────────────────────────────────────
  const handleExportTxt = () => {
    if (!editorRef.current) return;
    const textContent = editorRef.current.innerText || "";
    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${docTitle.trim().replace(/[^a-zA-Z0-9_\-\s]/g, "") || "document"}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
  };

  // ── Export 2: Microsoft Word (.docx) ───────────────────────────────────────
  const handleExportDocx = async () => {
    setIsExportMenuOpen(false);
    if (!editorRef.current) return;

    try {
      // Dynamic import of the installed 'docx' package
      const docx = await import("docx");
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;

      const children = [];
      const nodes = editorRef.current.childNodes;

      nodes.forEach((node) => {
        const text = node.innerText || node.textContent || "";
        if (!text.trim()) {
          children.push(new Paragraph({ children: [new TextRun("")] }));
          return;
        }

        const tag = node.nodeName ? node.nodeName.toLowerCase() : "";
        if (tag === "h1") {
          children.push(
            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              children: [new TextRun({ text, bold: true, size: 36 })],
            })
          );
        } else if (tag === "h2") {
          children.push(
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              children: [new TextRun({ text, bold: true, size: 28 })],
            })
          );
        } else if (tag === "h3") {
          children.push(
            new Paragraph({
              heading: HeadingLevel.HEADING_3,
              children: [new TextRun({ text, bold: true, size: 24 })],
            })
          );
        } else if (tag === "ul" || tag === "ol") {
          node.childNodes.forEach((li) => {
            const liText = li.innerText || li.textContent || "";
            if (liText.trim()) {
              children.push(
                new Paragraph({
                  bullet: { level: 0 },
                  children: [new TextRun({ text: liText, size: 22 })],
                })
              );
            }
          });
        } else {
          children.push(
            new Paragraph({
              spacing: { after: 120, line: 276 },
              children: [new TextRun({ text, size: 22 })],
            })
          );
        }
      });

      const doc = new Document({
        title: docTitle,
        sections: [{ properties: {}, children }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${docTitle.trim().replace(/[^a-zA-Z0-9_\-\s]/g, "") || "document"}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("DOCX compilation error:", err);
      // Fallback: download as text if docx compiler fails
      handleExportTxt();
    }
  };

  // ── Export 3: PDF Document (.pdf) ──────────────────────────────────────────
  const handleExportPdf = async () => {
    setIsExportMenuOpen(false);
    if (!editorRef.current) return;

    try {
      // Dynamic import of the installed 'pdf-lib' package
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const pageWidth = 595.28; // Standard A4 width in points
      const pageHeight = 841.89; // Standard A4 height in points
      const margin = 54; // 0.75-inch margin
      const contentWidth = pageWidth - margin * 2;

      let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      let cursorY = pageHeight - margin;

      // Draw Header Title on first page
      currentPage.drawText(docTitle, {
        x: margin,
        y: cursorY,
        size: 18,
        font: fontBold,
        color: rgb(0.1, 0.15, 0.25),
      });
      cursorY -= 30;

      // Draw divider line
      currentPage.drawLine({
        start: { x: margin, y: cursorY },
        end: { x: pageWidth - margin, y: cursorY },
        thickness: 0.75,
        color: rgb(0.8, 0.85, 0.9),
      });
      cursorY -= 24;

      const rawText = editorRef.current.innerText || "";
      const lines = rawText.split("\n");

      for (const line of lines) {
        if (!line.trim()) {
          cursorY -= 12;
          continue;
        }

        // Simple text wrap
        const words = line.split(" ");
        let currentLine = "";

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const textWidth = font.widthOfTextAtSize(testLine, 10.5);

          if (textWidth > contentWidth && currentLine) {
            if (cursorY < margin + 20) {
              currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
              cursorY = pageHeight - margin;
            }
            currentPage.drawText(currentLine, {
              x: margin,
              y: cursorY,
              size: 10.5,
              font,
              color: rgb(0.15, 0.15, 0.15),
            });
            cursorY -= 15;
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }

        if (currentLine) {
          if (cursorY < margin + 20) {
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            cursorY = pageHeight - margin;
          }
          currentPage.drawText(currentLine, {
            x: margin,
            y: cursorY,
            size: 10.5,
            font,
            color: rgb(0.15, 0.15, 0.15),
          });
          cursorY -= 15;
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${docTitle.trim().replace(/[^a-zA-Z0-9_\-\s]/g, "") || "document"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation error:", err);
      // Fallback: browser print dialog
      window.print();
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-800">
      {/* ── Sticky Workspace Header (Strictly NO Homepage Button) ─────────── */}
      <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/70 rounded-lg transition-colors focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30"
            title="Return to Dashboard"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span className="hidden xs:inline">Dashboard</span>
          </button>

          <div className="h-5 w-px bg-slate-200 shrink-0" />

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
              {/* Document Creation Pencil Icon */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate leading-tight">
                Create Document
              </h1>
              <p className="text-xs text-slate-500 hidden md:block truncate">
                Write, format, and export professional documents
              </p>
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Templates Trigger */}
          <button
            type="button"
            onClick={() => setIsTemplateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200/80"
            title="Browse Starter Templates"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            <span className="hidden sm:inline">Templates</span>
          </button>

          {/* Save Draft Action */}
          <button
            type="button"
            onClick={saveDraftLocally}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors shadow-2xs"
            title="Save draft to browser storage (Ctrl+S)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
            </svg>
            <span>Save Draft</span>
          </button>

          {/* Export Dropdown Menu */}
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
              title="Export document"
            >
              <span>Export</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-40 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
                <button
                  type="button"
                  onClick={handleExportTxt}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 text-slate-700"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <div>
                    <div className="font-semibold text-slate-800">Plain Text (.txt)</div>
                    <div className="text-2xs text-slate-400">Lightweight unformatted text</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleExportDocx}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 text-slate-700"
                >
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.53-4.5h7.5M8.25 9.75h4.5" />
                  </svg>
                  <div>
                    <div className="font-semibold text-slate-800">Microsoft Word (.docx)</div>
                    <div className="text-2xs text-slate-400">Headings, paragraphs &amp; lists</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 text-slate-700"
                >
                  <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24-1.077-.32-2.18-.32-3.284 0-1.104.08-2.207.32-3.284m10.56 0c.24 1.077.32 2.18.32 3.284 0 1.104-.08 2.207-.32 3.284M3.75 6.75h16.5M3.75 17.25h16.5" />
                  </svg>
                  <div>
                    <div className="font-semibold text-slate-800">PDF Document (.pdf)</div>
                    <div className="text-2xs text-slate-400">Paginated print-ready document</div>
                  </div>
                </button>

                <div className="h-px bg-slate-100 my-1" />

                <button
                  type="button"
                  onClick={() => {
                    setIsExportMenuOpen(false);
                    setIsCloudNoticeOpen(true);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 text-slate-700"
                >
                  <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                  <div>
                    <div className="font-semibold text-slate-800">Save to Account...</div>
                    <div className="text-2xs text-purple-600 font-medium">Cloud sync status</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Document Subheader / Title & Status Bar ────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Document Title Input */}
        <div className="flex-1 min-w-[220px]">
          <input
            type="text"
            value={docTitle}
            onChange={(e) => {
              setDocTitle(e.target.value);
              setIsDirty(true);
            }}
            placeholder="Untitled Document"
            className="w-full text-base sm:text-lg font-bold text-slate-800 hover:bg-slate-50 focus:bg-white px-2 py-1 -ml-2 rounded-lg border border-transparent hover:border-slate-200 focus:border-blue-400 focus:outline-hidden transition-all truncate"
            title="Click to rename document"
          />
        </div>

        {/* Status Indicators & Clear Action */}
        <div className="flex items-center gap-3 text-xs shrink-0">
          {saveToast ? (
            <span className="text-emerald-600 font-medium animate-pulse">{saveToast}</span>
          ) : isDirty ? (
            <span className="inline-flex items-center gap-1.5 text-amber-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Unsaved changes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {lastSavedTime ? `Draft saved (${lastSavedTime})` : "Draft ready"}
            </span>
          )}

          <div className="h-4 w-px bg-slate-200" />

          <button
            type="button"
            onClick={() => setIsConfirmClearOpen(true)}
            className="text-slate-400 hover:text-red-600 transition-colors"
            title="Clear current document content"
          >
            Clear
          </button>
        </div>
      </div>

      {/* ── Formatting Toolbar ────────────────────────────────────────────── */}
      <div className="sticky top-16 z-20 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/90 px-3 sm:px-8 py-1.5 flex flex-wrap items-center gap-1 sm:gap-1.5 shadow-2xs">
        {/* Style Dropdown (Paragraph, H1, H2, H3) */}
        <select
          onChange={handleHeadingChange}
          defaultValue="p"
          className="h-8 px-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/30"
          title="Paragraph Style"
        >
          <option value="p">Normal Text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>

        <div className="h-4 w-px bg-slate-300 mx-0.5" />

        {/* Bold */}
        <button
          type="button"
          onClick={() => executeCmd("bold")}
          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs transition-colors ${
            activeFormats.bold ? "bg-blue-100 text-blue-700 font-black" : "text-slate-700 hover:bg-white"
          }`}
          title="Bold (Ctrl+B)"
        >
          B
        </button>

        {/* Italic */}
        <button
          type="button"
          onClick={() => executeCmd("italic")}
          className={`w-8 h-8 rounded-lg flex items-center justify-center italic text-xs transition-colors ${
            activeFormats.italic ? "bg-blue-100 text-blue-700 font-bold" : "text-slate-700 hover:bg-white"
          }`}
          title="Italic (Ctrl+I)"
        >
          I
        </button>

        {/* Underline */}
        <button
          type="button"
          onClick={() => executeCmd("underline")}
          className={`w-8 h-8 rounded-lg flex items-center justify-center underline text-xs transition-colors ${
            activeFormats.underline ? "bg-blue-100 text-blue-700 font-bold" : "text-slate-700 hover:bg-white"
          }`}
          title="Underline (Ctrl+U)"
        >
          U
        </button>

        {/* Strike */}
        <button
          type="button"
          onClick={() => executeCmd("strikeThrough")}
          className={`w-8 h-8 rounded-lg flex items-center justify-center line-through text-xs transition-colors ${
            activeFormats.strikeThrough ? "bg-blue-100 text-blue-700 font-bold" : "text-slate-700 hover:bg-white"
          }`}
          title="Strikethrough"
        >
          S
        </button>

        <div className="h-4 w-px bg-slate-300 mx-0.5" />

        {/* Bullet List */}
        <button
          type="button"
          onClick={() => executeCmd("insertUnorderedList")}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            activeFormats.ul ? "bg-blue-100 text-blue-700" : "text-slate-700 hover:bg-white"
          }`}
          title="Bullet list"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </button>

        {/* Numbered List */}
        <button
          type="button"
          onClick={() => executeCmd("insertOrderedList")}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            activeFormats.ol ? "bg-blue-100 text-blue-700" : "text-slate-700 hover:bg-white"
          }`}
          title="Numbered list"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M4.5 7.5V4.5m0 0L3.5 5.5M4.5 13.5v-2a1 1 0 011-1h.5a1 1 0 011 1v.5a1 1 0 01-1 1H4.5zm0 0h2.5M4.5 19.5h1.5a1 1 0 001-1v-.5a1 1 0 00-1-1H5a1 1 0 011-1v-.5a1 1 0 00-1-1H4.5" />
          </svg>
        </button>

        {/* Horizontal Rule */}
        <button
          type="button"
          onClick={() => executeCmd("insertHorizontalRule")}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 hover:bg-white transition-colors"
          title="Insert horizontal divider"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
          </svg>
        </button>

        <div className="h-4 w-px bg-slate-300 mx-0.5" />

        {/* Align Left */}
        <button
          type="button"
          onClick={() => executeCmd("justifyLeft")}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 hover:bg-white transition-colors"
          title="Align Left"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h10.5m-10.5 5.25h16.5" />
          </svg>
        </button>

        {/* Align Center */}
        <button
          type="button"
          onClick={() => executeCmd("justifyCenter")}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 hover:bg-white transition-colors"
          title="Align Center"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M6.75 12h10.5m-13.5 5.25h16.5" />
          </svg>
        </button>

        <div className="h-4 w-px bg-slate-300 mx-0.5" />

        {/* Undo */}
        <button
          type="button"
          onClick={() => executeCmd("undo")}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 hover:bg-white transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
        </button>

        {/* Redo */}
        <button
          type="button"
          onClick={() => executeCmd("redo")}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 hover:bg-white transition-colors"
          title="Redo (Ctrl+Y)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
          </svg>
        </button>

        {/* Clear Formatting */}
        <button
          type="button"
          onClick={() => executeCmd("removeFormat")}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-white transition-colors ml-auto sm:ml-0"
          title="Clear text formatting"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Central Document Paper Workspace ──────────────────────────────── */}
      <main className="flex-1 flex justify-center p-4 sm:p-8 lg:p-12 overflow-y-auto">
        <div className="w-full max-w-4xl bg-white rounded-xl sm:rounded-2xl shadow-md border border-slate-200/80 p-6 sm:p-12 lg:p-16 min-h-[700px] flex flex-col focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => {
              setIsDirty(true);
              updateStats();
            }}
            onKeyUp={checkActiveFormats}
            onMouseUp={checkActiveFormats}
            onKeyDown={handleKeyDown}
            className="flex-1 outline-hidden prose prose-slate max-w-none text-slate-800 text-sm sm:text-base leading-relaxed selection:bg-blue-100 selection:text-blue-900"
            style={{ minHeight: "550px" }}
          />
        </div>
      </main>

      {/* ── Document Footer / Statistics Bar ──────────────────────────────── */}
      <footer className="bg-white border-t border-slate-200 px-4 sm:px-8 py-2 flex flex-wrap items-center justify-between gap-3 text-2xs text-slate-500">
        <div className="flex items-center gap-3">
          <span>
            Words: <strong className="text-slate-700 font-semibold">{wordCount}</strong>
          </span>
          <span>&bull;</span>
          <span>
            Characters: <strong className="text-slate-700 font-semibold">{charCount}</strong>
          </span>
          <span>&bull;</span>
          <span>
            Est. Reading Time:{" "}
            <strong className="text-slate-700 font-semibold">
              {Math.max(1, Math.ceil(wordCount / 200))} min
            </strong>
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-slate-400">
          <span>Shortcuts:</span>
          <span><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600">Ctrl+B</kbd> Bold</span>
          <span><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600">Ctrl+I</kbd> Italic</span>
          <span><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600">Ctrl+S</kbd> Save Draft</span>
        </div>
      </footer>

      {/* ── Template Picker Modal ─────────────────────────────────────────── */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  Select a Starter Template
                </h3>
                <p className="text-xs text-slate-500">
                  Pick a template to jumpstart your document. You can customize all text.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 py-4 overflow-y-auto">
              {DOCUMENT_TEMPLATES.map((tmpl) => (
                <div
                  key={tmpl.id}
                  onClick={() => handleSelectTemplate(tmpl)}
                  className="p-4 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition-all cursor-pointer flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-slate-800 group-hover:text-emerald-700">
                        {tmpl.title}
                      </span>
                      <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-800">
                        {tmpl.badge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {tmpl.description}
                    </p>
                  </div>
                  <div className="mt-3 text-2xs font-semibold text-emerald-600 flex items-center gap-1">
                    <span>Use this template</span>
                    <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Discard Unsaved Changes (Template Switch Confirmation) ─────────── */}
      {isConfirmTemplateOpen && pendingTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h4 className="text-base font-bold text-slate-900 mb-2">
              Replace current document?
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed mb-5">
              You have unsaved changes in your document. Loading the <strong>{pendingTemplate.title}</strong> template will replace your current content.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsConfirmTemplateOpen(false);
                  setPendingTemplate(null);
                }}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => applyTemplate(pendingTemplate)}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-xs"
              >
                Replace Content
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Clear Canvas Modal ────────────────────────────────────── */}
      {isConfirmClearOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h4 className="text-base font-bold text-slate-900 mb-2">
              Clear document content?
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed mb-5">
              This will erase all content in the editor. This action cannot be reversed.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsConfirmClearOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearEditor}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-xs"
              >
                Clear Everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cloud Sync Status Notice ───────────────────────────────────────── */}
      {isCloudNoticeOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
            </div>
            <h4 className="text-base font-bold text-slate-900 mb-1.5">
              Cloud Document Sync
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed mb-3">
              Cloud account persistence will be connected when the Document Database API is integrated with the main Dashboard.
            </p>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-2xs text-slate-500 mb-4 space-y-1">
              <div>&bull; <strong>Current Status:</strong> Your draft is safely auto-saved locally in browser storage.</div>
              <div>&bull; <strong>Recommended:</strong> Use the <strong>Export</strong> button to download your work as <strong>.docx</strong>, <strong>.pdf</strong>, or <strong>.txt</strong> anytime.</div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setIsCloudNoticeOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}