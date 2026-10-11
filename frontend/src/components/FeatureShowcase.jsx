import { useEffect, useState, useRef } from "react";

// ── Shared Check Icon ────────────────────────────────────────────────────────
function CheckIcon() {
  return (
    <svg
      className="w-4 h-4 text-blue-600 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

// ── Mockup 1: Edit Documents ──────────────────────────────────────────────────
function EditMockup() {
  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-xs">
      {/* Editor top toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
          <span className="font-semibold text-slate-700 bg-white border border-slate-200 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded shadow-2xs text-[11px] sm:text-xs">
            Inter 14pt
          </span>
          <div className="h-3.5 sm:h-4 w-px bg-slate-200 mx-0.5" />
          <button type="button" className="font-bold text-slate-800 bg-white border border-slate-200 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs">
            B
          </button>
          <button type="button" className="italic text-slate-600 px-1 sm:px-1.5 py-0.5 sm:py-1 rounded hover:bg-slate-200/60 text-xs">
            I
          </button>
          <button type="button" className="underline text-slate-600 px-1 sm:px-1.5 py-0.5 sm:py-1 rounded hover:bg-slate-200/60 text-xs">
            U
          </button>
          <div className="h-3.5 sm:h-4 w-px bg-slate-200 mx-0.5" />
          <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-blue-600 border border-white ring-1 ring-slate-300 flex-shrink-0" />
        </div>
        <div className="flex items-center gap-1 text-slate-500">
          <span className="text-[10px] sm:text-[11px] font-medium text-blue-600 bg-blue-50 px-1.5 sm:px-2 py-0.5 rounded-full border border-blue-100 whitespace-nowrap">
            Editing Mode
          </span>
        </div>
      </div>

      {/* Editor canvas area */}
      <div className="p-3 sm:p-5 bg-slate-100/60 min-h-[190px] sm:min-h-[220px] flex justify-center items-center">
        <div className="w-full max-w-sm bg-white rounded-lg border border-slate-200 p-3 sm:p-4 shadow-sm relative">
          {/* Document header */}
          <div className="h-2.5 sm:h-3 w-28 sm:w-32 bg-slate-800 rounded-xs mb-2.5 sm:mb-3" />

          {/* Active edited text block */}
          <div className="p-1.5 sm:p-2 -mx-1 sm:-mx-2 rounded border border-dashed border-blue-500 bg-blue-50/40 relative mb-2.5 sm:mb-3">
            <span className="absolute -top-2.5 right-2 text-[8px] sm:text-[9px] font-semibold text-white bg-blue-600 px-1.5 py-0.2 rounded">
              Selected Text
            </span>
            <div className="h-1.5 sm:h-2 w-full bg-blue-700/80 rounded-xs mb-1.5" />
            <div className="h-1.5 sm:h-2 w-4/5 bg-blue-700/80 rounded-xs" />
          </div>

          {/* Regular text lines */}
          <div className="space-y-1.5 sm:space-y-2 mb-2.5 sm:mb-3">
            <div className="h-1.5 sm:h-2 w-full bg-slate-200 rounded-xs" />
            <div className="h-1.5 sm:h-2 w-11/12 bg-slate-200 rounded-xs" />
            <div className="h-1.5 sm:h-2 w-3/4 bg-slate-200 rounded-xs" />
          </div>

          {/* Inline image thumbnail mockup */}
          <div className="flex items-center gap-2 sm:gap-2.5 p-1.5 sm:p-2 bg-slate-50 border border-slate-200 rounded-md">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="h-1.5 sm:h-2 w-16 sm:w-20 bg-slate-700 rounded-xs mb-1" />
              <div className="h-1 sm:h-1.5 w-12 sm:w-14 bg-slate-300 rounded-xs" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mockup 2: Convert Documents ───────────────────────────────────────────────
function ConvertMockup() {
  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 sm:p-5 text-xs">
      {/* File card */}
      <div className="flex items-center justify-between p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-xl mb-3 sm:mb-4 gap-2">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center font-bold text-red-600 text-[10px] sm:text-[11px] flex-shrink-0">
            PDF
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-xs sm:text-[13px] truncate">Annual_Report_2026.pdf</p>
            <p className="text-slate-400 text-[10px] sm:text-[11px] truncate">3.8 MB • Original Document</p>
          </div>
        </div>
        <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 font-semibold text-[10px] px-2 py-0.5 rounded-full flex-shrink-0">
          Ready
        </span>
      </div>

      {/* Target format picker */}
      <div className="mb-3 sm:mb-4">
        <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Select Target Format
        </p>
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
          {[
            { label: "Word", ext: ".docx", active: true },
            { label: "Excel", ext: ".xlsx", active: false },
            { label: "PowerPoint", ext: ".pptx", active: false },
            { label: "Images", ext: ".png", active: false },
          ].map((item) => (
            <div
              key={item.label}
              className={[
                "p-1.5 sm:p-2 rounded-lg border text-center transition-all min-w-0",
                item.active
                  ? "bg-blue-50 border-blue-500 shadow-2xs"
                  : "bg-white border-slate-200 hover:border-slate-300",
              ].join(" ")}
            >
              <p className={`font-semibold text-[11px] sm:text-xs truncate ${item.active ? "text-blue-700" : "text-slate-700"}`}>
                {item.label}
              </p>
              <p className="text-[9px] sm:text-[10px] text-slate-400 truncate">{item.ext}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Progress & action button */}
      <div className="pt-2.5 sm:pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-slate-500 text-[10px] sm:text-[11px] min-w-0">
          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 flex-shrink-0" />
          <span className="truncate">High fidelity conversion enabled</span>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-white font-semibold text-[11px] sm:text-xs flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)" }}
        >
          <span>Convert Now</span>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Mockup 3: AI Document Analyzer ────────────────────────────────────────────
function AnalyzeMockup() {
  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 sm:p-5 text-xs">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-2.5 sm:pb-3 mb-2.5 sm:mb-3 border-b border-slate-100 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
            <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
          </span>
          <span className="font-semibold text-slate-800 text-[11px] sm:text-xs truncate">AI Document Assistant</span>
        </div>
        <span className="text-[10px] text-slate-400 font-medium truncate flex-shrink-0">Agreement_Master_v2.pdf</span>
      </div>

      {/* Chat messages */}
      <div className="space-y-2.5 sm:space-y-3 mb-2.5 sm:mb-3">
        {/* User message */}
        <div className="flex justify-end">
          <div className="max-w-[90%] sm:max-w-[85%] bg-blue-600 text-white p-2 sm:p-2.5 rounded-xl rounded-tr-xs text-[11px] sm:text-xs break-words">
            What is the termination period under section 8?
          </div>
        </div>

        {/* AI response */}
        <div className="flex items-start gap-2">
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px] sm:text-[10px] font-bold flex-shrink-0 mt-0.5">
            AI
          </div>
          <div className="flex-1 bg-slate-50 border border-slate-200 p-2 sm:p-2.5 rounded-xl rounded-tl-xs min-w-0">
            <p className="text-slate-700 leading-relaxed mb-1.5 text-[11px] sm:text-xs break-words">
              Either party may terminate this agreement with <strong>30 days written notice</strong>. Immediate termination applies only in breach of confidentiality.
            </p>
            <div className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded max-w-full">
              <span className="truncate">Source: Page 12, Clause 8.2</span>
            </div>
          </div>
        </div>
      </div>

      {/* Suggested prompts */}
      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5 sm:gap-2">
        <span className="text-[10px] text-slate-400 font-medium">Quick prompt:</span>
        <button
          type="button"
          className="text-[9px] sm:text-[10px] text-slate-600 bg-slate-100 hover:bg-slate-200/70 border border-slate-200 px-2 py-0.5 rounded-full transition-colors truncate max-w-full"
        >
          Summarize obligations →
        </button>
      </div>
    </div>
  );
}

// ── Mockup 4: Sign Documents ──────────────────────────────────────────────────
function SignMockup() {
  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 sm:p-5 text-xs">
      {/* Top contract status */}
      <div className="flex items-center justify-between pb-2.5 sm:pb-3 mb-2.5 sm:mb-3 border-b border-slate-100 gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 text-[11px] sm:text-xs truncate">Master Services Agreement</p>
          <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">Recipient: alex.morgan@company.com</p>
        </div>
        <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold flex-shrink-0 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Pending Signature
        </span>
      </div>

      {/* Contract paper snippet */}
      <div className="p-2.5 sm:p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl mb-3 space-y-1.5 sm:space-y-2">
        <div className="h-1.5 sm:h-2 w-full bg-slate-200 rounded-xs" />
        <div className="h-1.5 sm:h-2 w-5/6 bg-slate-200 rounded-xs" />
        <div className="h-1.5 sm:h-2 w-2/3 bg-slate-200 rounded-xs" />

        {/* Signature stamp container */}
        <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-slate-200 flex flex-col xs:flex-row xs:items-center justify-between gap-2.5 sm:gap-3">
          <div className="border-2 border-dashed border-blue-500 bg-blue-50/50 rounded-lg p-2 sm:p-2.5 flex-1 relative min-w-0">
            <span className="absolute -top-2 left-2 text-[8px] sm:text-[9px] font-bold text-blue-700 bg-white border border-blue-200 px-1 rounded">
              Sign Here
            </span>
            <p className="font-serif italic text-sm sm:text-base font-bold text-slate-800 tracking-wide truncate">
              Alex Morgan
            </p>
            <p className="text-[8px] sm:text-[9px] text-slate-400 mt-0.5 truncate">e-Signed via 256-bit PKI</p>
          </div>

          <div className="space-y-0.5 sm:space-y-1 xs:text-right flex xs:flex-col justify-between items-center xs:items-end">
            <p className="text-[9px] sm:text-[10px] text-slate-400">Date Signed</p>
            <p className="font-semibold text-slate-700 text-[11px] sm:text-xs">Oct 07, 2026</p>
          </div>
        </div>
      </div>

      {/* Footer verification info */}
      <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-500 pt-1 gap-2">
        <span className="flex items-center gap-1 truncate">
          <svg className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
          <span className="truncate">Audit trail attached</span>
        </span>
        <button type="button" className="text-blue-600 font-semibold hover:underline flex-shrink-0">
          View Certificate
        </button>
      </div>
    </div>
  );
}

// ── Mockup 5: Organize Documents ──────────────────────────────────────────────
function OrganizeMockup() {
  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 sm:p-5 text-xs">
      {/* Top action bar */}
      <div className="flex items-center justify-between pb-2.5 sm:pb-3 mb-2.5 sm:mb-3 border-b border-slate-100 gap-1.5 sm:gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="font-semibold text-slate-800 text-[11px] sm:text-xs truncate">4 Pages Selected</span>
          <span className="text-slate-400 text-[10px] sm:text-xs truncate">• Deck.pdf</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button type="button" className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 text-[10px] sm:text-xs">
            Rotate
          </button>
          <button type="button" className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 text-[10px] sm:text-xs">
            Extract
          </button>
          <button type="button" className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 text-[10px] sm:text-xs">
            Merge
          </button>
        </div>
      </div>

      {/* Pages grid */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5 mb-2.5 sm:mb-3">
        {[
          { page: 1, active: false, label: "Cover" },
          { page: 2, active: true, label: "TOC" },
          { page: 3, active: false, label: "Financials" },
          { page: 4, active: false, label: "Appendix" },
        ].map((item) => (
          <div
            key={item.page}
            className={[
              "rounded-lg border p-1 sm:p-2 flex flex-col items-center text-center transition-all relative min-w-0",
              item.active
                ? "bg-blue-50/50 border-blue-500 shadow-2xs ring-1 ring-blue-500"
                : "bg-slate-50 border-slate-200 hover:border-slate-300",
            ].join(" ")}
          >
            {item.active && (
              <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-blue-600 text-white rounded-full flex items-center justify-center text-[8px] sm:text-[9px] font-bold">
                ✓
              </span>
            )}
            {/* Page miniature preview lines */}
            <div className="w-full h-10 sm:h-14 bg-white rounded border border-slate-200 p-1 sm:p-1.5 mb-1 sm:mb-2 flex flex-col justify-between">
              <div className="h-1 sm:h-1.5 w-3/4 bg-slate-300 rounded-xs" />
              <div className="space-y-0.5 sm:space-y-1">
                <div className="h-0.5 sm:h-1 w-full bg-slate-200 rounded-xs" />
                <div className="h-0.5 sm:h-1 w-5/6 bg-slate-200 rounded-xs" />
                <div className="h-0.5 sm:h-1 w-2/3 bg-slate-200 rounded-xs" />
              </div>
              <div className="h-1 sm:h-1.5 w-1/2 bg-slate-300 rounded-xs" />
            </div>
            <span className="font-semibold text-slate-700 text-[10px] sm:text-[11px] truncate w-full">Page {item.page}</span>
            <span className="text-[8px] sm:text-[9px] text-slate-400 truncate w-full">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Drag helper hint */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400 gap-1.5">
        <span className="truncate">Drag & drop pages to rearrange</span>
        <span className="text-blue-600 font-medium whitespace-nowrap flex-shrink-0">Add +</span>
      </div>
    </div>
  );
}

// ── Feature Data ──────────────────────────────────────────────────────────────
const features = [
  {
    id: "edit",
    heading: "Edit every detail with pixel precision.",
    description:
      "Update text, replace images, adjust typography, and reformat pages directly in your browser without disrupting original document layouts.",
    buttonText: "Explore Edit Tools",
    icon: (
      <svg
        className="w-4 h-4 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
        />
      </svg>
    ),
    mockup: <EditMockup />,
  },
  {
    id: "convert",
    heading: "Convert between all major formats seamlessly.",
    description:
      "Transform PDFs into editable Word docs, Excel spreadsheets, PowerPoint presentations, or high-res images in seconds with pristine fidelity.",
    buttonText: "Explore Convert Tools",
    icon: (
      <svg
        className="w-4 h-4 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
        />
      </svg>
    ),
    mockup: <ConvertMockup />,
  },
  {
    id: "analyze",
    heading: "Chat with your files and extract instant insights.",
    description:
      "Understand long reports, summarize dense contracts, and ask questions to receive clear answers backed by exact page references.",
    buttonText: "Explore AI Analyzer",
    icon: (
      <svg
        className="w-4 h-4 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
        />
      </svg>
    ),
    mockup: <AnalyzeMockup />,
  },
  {
    id: "sign",
    heading: "Request and place legally binding e-signatures.",
    description:
      "Prepare signature fields, sign contracts from any device, and maintain an immutable cryptographic audit trail for compliance and safety.",
    buttonText: "Explore eSign Tools",
    icon: (
      <svg
        className="w-4 h-4 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
        />
      </svg>
    ),
    mockup: <SignMockup />,
  },
  {
    id: "organize",
    heading: "Merge, split, and arrange files effortlessly.",
    description:
      "Reorder pages with visual drag-and-drop, combine separate documents into a unified file, split chapters, and keep your workspace clean.",
    buttonText: "Explore Organize Tools",
    icon: (
      <svg
        className="w-4 h-4 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-1.5-.58"
        />
      </svg>
    ),
    mockup: <OrganizeMockup />,
  },
];

const slides = [...features, ...features, ...features];

// ── Main FeatureShowcase Component ────────────────────────────────────────────
export default function FeatureShowcase() {
  const [mounted, setMounted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(features.length); // starts at middle set (index 5)
  const [isTransitioning, setIsTransitioning] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);

  const viewportRef = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Track responsive viewport width precisely
  useEffect(() => {
    const updateWidth = () => {
      if (viewportRef.current) {
        setViewportWidth(viewportRef.current.offsetWidth);
      } else if (typeof window !== "undefined") {
        setViewportWidth(window.innerWidth);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // Detect user prefers-reduced-motion
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mediaQuery.matches);
      const listener = (e) => setReducedMotion(e.matches);
      mediaQuery.addEventListener?.("change", listener);
      return () => mediaQuery.removeEventListener?.("change", listener);
    }
  }, []);

  // Re-enable transition on next frame after silent jump
  useEffect(() => {
    if (!isTransitioning) {
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsTransitioning(true);
        });
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isTransitioning]);

  // Handlers for manual and auto navigation
  const handlePrev = () => {
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev - 1);
  };

  const handleNext = () => {
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev + 1);
  };

  const handleCardClick = (idx) => {
    if (idx === currentIndex) return;
    setIsTransitioning(true);
    setCurrentIndex(idx);
  };

  // Automatic sliding every 4000ms (4 seconds) with hover and interaction pause
  useEffect(() => {
    if (isPaused || reducedMotion) return;

    const timer = setInterval(() => {
      handleNext();
    }, 4000);

    return () => clearInterval(timer);
  }, [isPaused, reducedMotion, currentIndex]);

  // Seamless boundary wrap when transition ends
  const handleTransitionEnd = (e) => {
    if (e.target !== e.currentTarget) return;

    if (currentIndex >= features.length * 2) {
      setIsTransitioning(false);
      setCurrentIndex((prev) => prev - features.length);
    } else if (currentIndex < features.length) {
      setIsTransitioning(false);
      setCurrentIndex((prev) => prev + features.length);
    }
  };

  // Touch handlers for mobile swipe
  const handleTouchStart = (e) => {
    setIsPaused(true);
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e) => {
    setIsPaused(false);
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchStartX - touchEndX;
    if (diffX > 45) {
      handleNext();
    } else if (diffX < -45) {
      handlePrev();
    }
    setTouchStartX(null);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (["INPUT", "TEXTAREA"].includes(e.target?.tagName)) return;
      if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const entryStyle = {
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(16px)",
    transition: "opacity 0.65s ease, transform 0.65s ease",
  };

  // Calculate card width and center offset in pixels so adjacent cards clearly peek in
  const isDesktop = viewportWidth >= 1024;
  const isTablet = viewportWidth >= 640 && viewportWidth < 1024;
  const isSmallMobile = viewportWidth < 380;
  const cardWidth = isDesktop
    ? Math.min(1080, Math.round(viewportWidth * 0.78))
    : isTablet
    ? Math.round(viewportWidth * 0.80)
    : isSmallMobile
    ? Math.max(280, Math.round(viewportWidth * 0.90))
    : Math.round(viewportWidth * 0.86);

  const centerOffset = Math.round((viewportWidth - cardWidth) / 2);
  const translateXPixels = centerOffset - currentIndex * cardWidth;

  return (
    <section
      aria-label="Features Showcase"
      className="relative w-full py-12 sm:py-20 lg:py-28 xl:py-32 overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% 45%, rgba(175, 212, 255, 0.88) 0%, rgba(196, 224, 255, 0.65) 40%, rgba(218, 236, 255, 0.38) 68%, rgba(255, 255, 255, 0.95) 100%), #FFFFFF",
      }}
    >
      {/* ── 1. Section Heading ──────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center mb-8 sm:mb-12 lg:mb-16" style={entryStyle}>
        <h2
          className="font-extrabold tracking-tight text-center break-words"
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            color: "#1F2937",
            fontSize: "clamp(1.875rem, 4.5vw, 3.75rem)",
            lineHeight: "1.15",
            letterSpacing: "-0.035em",
          }}
        >
          Design docs, reimagined
        </h2>
      </div>

      {/* ── 2. Carousel Viewport with Peeking Adjacent Cards ─────────────────── */}
      <div
        ref={viewportRef}
        className="w-full overflow-hidden select-none py-3 sm:py-4"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={entryStyle}
      >
        <div
          onTransitionEnd={handleTransitionEnd}
          className="flex items-center"
          style={{
            transform: `translateX(${translateXPixels}px)`,
            transition: isTransitioning
              ? reducedMotion
                ? "transform 350ms ease"
                : "transform 700ms cubic-bezier(0.25, 1.12, 0.35, 1)"
              : "none",
            willChange: "transform",
          }}
        >
          {slides.map((feature, idx) => {
            const isActive = idx === currentIndex;
            return (
              <div
                key={`${feature.id}-${idx}`}
                onClick={() => handleCardClick(idx)}
                style={{ width: `${cardWidth}px`, flexShrink: 0 }}
                className="px-1.5 sm:px-3 lg:px-4"
              >
                {/* ── 3. Main Feature Card (Distinct surface, taller height) ──── */}
                <div
                  className="w-full transition-all flex flex-col justify-center min-w-0"
                  style={{
                    backgroundColor: "#F3F5F7",
                    border: "1px solid rgba(148, 163, 184, 0.28)",
                    borderRadius: isDesktop ? "40px" : "28px",
                    boxShadow: isActive
                      ? "0 18px 45px rgba(51, 65, 85, 0.10), 0 4px 12px rgba(51, 65, 85, 0.05)"
                      : "0 10px 28px rgba(51, 65, 85, 0.06), 0 2px 8px rgba(51, 65, 85, 0.03)",
                    transform: isActive ? "scale(1)" : "scale(0.95)",
                    opacity: isActive ? 1 : 0.88,
                    minHeight: isDesktop ? "480px" : "auto",
                    padding: isDesktop
                      ? "52px 48px"
                      : isTablet
                      ? "36px 28px"
                      : "24px 16px",
                    transition: isTransitioning
                      ? reducedMotion
                        ? "opacity 300ms ease"
                        : "transform 700ms cubic-bezier(0.25, 1.12, 0.35, 1), opacity 700ms ease, box-shadow 700ms ease"
                      : "none",
                    cursor: isActive ? "default" : "pointer",
                  }}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-12 items-center">
                    {/* LEFT COLUMN — Text & Purple Button */}
                    <div className="lg:col-span-5 w-full text-left flex flex-col justify-center min-w-0">
                      <h3
                        className="font-extrabold tracking-tight mb-2.5 sm:mb-4 lg:mb-5 text-xl sm:text-2xl md:text-3xl lg:text-4xl break-words"
                        style={{
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                          color: "#1F2937",
                          lineHeight: "1.2",
                          letterSpacing: "-0.03em",
                        }}
                      >
                        {feature.heading}
                      </h3>
                      <p
                        className="font-normal leading-relaxed text-xs sm:text-sm md:text-base lg:text-lg mb-4 sm:mb-6 lg:mb-8 break-words"
                        style={{
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                          color: "#6B7280",
                        }}
                      >
                        {feature.description}
                      </p>
                      <div>
                        <button
                          type="button"
                          className="w-full xs:w-auto inline-flex items-center justify-center gap-2 sm:gap-2.5 px-4 sm:px-6 py-2.5 sm:py-3.5 lg:px-7 lg:py-4 rounded-xl sm:rounded-2xl font-semibold text-xs sm:text-sm lg:text-base shadow-xs hover:shadow-md transition-all duration-200 hover:brightness-110 active:scale-[0.98] cursor-pointer"
                          style={{
                            backgroundColor: "#7C3AED",
                            color: "#FFFFFF",
                            pointerEvents: isActive ? "auto" : "none",
                          }}
                        >
                          {feature.icon}
                          <span className="truncate">{feature.buttonText}</span>
                        </button>
                      </div>
                    </div>

                    {/* RIGHT COLUMN — Feature Mockup Graphic */}
                    <div
                      className="lg:col-span-7 w-full flex items-center justify-center overflow-hidden min-w-0"
                      style={{ pointerEvents: isActive ? "auto" : "none" }}
                    >
                      <div className="w-full max-w-lg lg:max-w-none">
                        {feature.mockup}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 4. Circular Arrow Navigation Controls ────────────────────────────── */}
      <div
        className="flex items-center justify-center gap-3 sm:gap-4 mt-8 sm:mt-10 lg:mt-14"
        style={entryStyle}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Previous feature card"
          className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-white border border-slate-200/90 shadow-xs flex items-center justify-center text-[#1F2937] hover:bg-slate-50 hover:border-slate-300 hover:shadow-md active:scale-95 transition-all duration-200 cursor-pointer"
        >
          <svg
            className="w-5 h-5 sm:w-6 sm:h-6"
            style={{ color: "#1F2937" }}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>

        <button
          type="button"
          onClick={handleNext}
          aria-label="Next feature card"
          className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-white border border-slate-200/90 shadow-xs flex items-center justify-center text-[#1F2937] hover:bg-slate-50 hover:border-slate-300 hover:shadow-md active:scale-95 transition-all duration-200 cursor-pointer"
        >
          <svg
            className="w-5 h-5 sm:w-6 sm:h-6"
            style={{ color: "#1F2937" }}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </section>
  );
}