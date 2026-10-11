import React, { useState, useEffect, useRef } from 'react';

export default function Capabilities() {
  const gridRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Respect prefers-reduced-motion immediately
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Toggle visibility state every time the grid enters or leaves the viewport
        setIsVisible(entry.isIntersecting);
      },
      {
        threshold: 0.08,
        rootMargin: '0px 0px -30px 0px',
      }
    );

    const currentGrid = gridRef.current;
    if (currentGrid) {
      observer.observe(currentGrid);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <section id="capabilities" className="py-16 sm:py-20 lg:py-24 bg-slate-50/50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
         <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14 lg:mb-16">
            {/* <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200/70 text-indigo-700 text-[11px] font-semibold uppercase tracking-wider mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse flex-shrink-0" />
              <span>Complete Document Intelligence</span>
            </div>  */}
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-4 break-words">
            Five Core Capabilities. <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-rose-500">
              One Unified Workspace.
            </span>
          </h2>
          <p className="text-slate-600 text-sm sm:text-base lg:text-lg leading-relaxed max-w-2xl mx-auto break-words">
            Everything your team needs to edit, convert, analyze, sign, and organize documents with speed and accuracy.
          </p>
        </div>

        {/* 12-Column Bento Grid Observed for Repeating Scroll Reveal */}
        <div
          ref={gridRef}
          className="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6 items-stretch"
        >
          {/* ========================================================
              CARD 1: ANALYZE (7 Cols on desktop, 12 on tablet) - Indigo / Violet Gradient
              ======================================================== */}
          <div
            style={{ transitionDelay: isVisible ? '0ms' : '0ms' }}
            className={`col-span-1 md:col-span-12 lg:col-span-7 rounded-3xl p-4 sm:p-6 lg:p-7 bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 border border-indigo-500/30 flex flex-col justify-between transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100 hover:shadow-[0_0_35px_rgba(99,102,241,0.45)] relative overflow-hidden group ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
            }`}
          >
            {/* Header Content */}
            <div className="mb-4 sm:mb-5 relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-semibold backdrop-blur-sm mb-2.5">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>AI Document Intelligence</span>
              </div>
              <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight mb-2 break-words">
                Analyze &amp; Understand
              </h3>
              <p className="text-indigo-100 text-xs sm:text-sm lg:text-base leading-relaxed max-w-xl break-words">
                Chat directly with 100+ page contracts, extract verified clauses, and summarize complex findings with pinpoint citations.
              </p>
            </div>

            {/* Inner Light UI Preview */}
            <div className="bg-white/95 rounded-2xl p-3 sm:p-4 shadow-lg border border-white/80 space-y-2.5 relative z-10 w-full min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 flex-shrink-0" />
                  <span className="text-xs font-bold text-slate-800 truncate">AI Document Analysis</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 break-all sm:break-normal">
                  MSA_Agreement_v4.pdf · Clause 14
                </span>
              </div>

              {/* User Prompt Bubble */}
              <div className="flex justify-end">
                <div className="bg-indigo-50 text-indigo-950 border border-indigo-100 px-3 py-1.5 rounded-2xl rounded-tr-sm text-xs font-medium max-w-[90%] sm:max-w-[85%] break-words">
                  "What are the early termination liabilities under Section 14.2?"
                </div>
              </div>

              {/* AI Response Panel */}
              <div className="bg-slate-50 rounded-2xl rounded-tl-sm p-3 border border-slate-200/80 space-y-2 w-full min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                  <svg className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Verified Citation Analysis</span>
                </div>
                <p className="text-slate-800 text-xs sm:text-sm leading-relaxed break-words">
                  Under <strong className="text-slate-900 font-semibold">Section 14.2</strong>, either party may terminate with a 30-day written notice. Zero early penalty fees are incurred if notice precedes the annual renewal window.
                </p>
                <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-0.5">
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-100 text-indigo-800">
                    ✓ 30-Day Window
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                    ✓ Zero Penalties
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-800">
                    Page 42, Para 3
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================
              CARD 2: EDIT (5 Cols on desktop, 6 on tablet) - Purple / Fuchsia Gradient
              ======================================================== */}
          <div
            style={{ transitionDelay: isVisible ? '100ms' : '0ms' }}
            className={`col-span-1 md:col-span-6 lg:col-span-5 rounded-3xl p-4 sm:p-6 lg:p-7 bg-gradient-to-br from-purple-700 via-fuchsia-600 to-pink-600 border border-purple-400/30 flex flex-col justify-between transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100 hover:shadow-[0_0_35px_rgba(192,38,211,0.45)] relative overflow-hidden group ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
            }`}
          >
            {/* Header Content */}
            <div className="mb-4 sm:mb-5 relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-semibold backdrop-blur-sm mb-2.5">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>Visual PDF Editor</span>
              </div>
              <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight mb-2 break-words">
                Edit In Place
              </h3>
              <p className="text-purple-100 text-xs sm:text-sm lg:text-base leading-relaxed break-words">
                Directly adjust text, replace graphics, reformat styles, and update contracts without converting back and forth.
              </p>
            </div>

            {/* Inner Light UI Preview */}
            <div className="bg-white/95 rounded-2xl p-3 sm:p-4 shadow-lg border border-white/80 space-y-2.5 relative z-10 w-full min-w-0">
              {/* Light Toolbar */}
              <div className="bg-slate-50 rounded-xl px-2.5 sm:px-3 py-1.5 border border-slate-200/80 flex items-center justify-between text-slate-700 text-xs flex-wrap gap-1.5">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="font-bold text-slate-900 px-1.5 py-0.5 bg-slate-200 rounded">B</span>
                  <span className="italic text-slate-700">I</span>
                  <span className="underline text-slate-700">U</span>
                  <span className="h-3 w-px bg-slate-300 mx-0.5 sm:mx-1" />
                  <span className="text-slate-600 font-medium">14pt</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800">
                  Text Mode
                </span>
              </div>

              {/* Editable Document Box */}
              <div className="bg-white rounded-xl p-3 border border-slate-200/90 shadow-sm space-y-2 w-full min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Service Level Guarantee
                </div>
                <div className="text-xs text-slate-800 leading-relaxed break-words">
                  The platform commits to a minimum uptime of{' '}
                  <span className="bg-purple-50 text-purple-950 border border-purple-300 rounded px-1.5 py-0.5 font-semibold inline-block relative max-w-full break-words">
                    99.98% per calendar month
                    <span className="inline-block w-0.5 h-3 bg-purple-600 ml-1 align-middle animate-pulse" />
                  </span>{' '}
                  with 24/7 technical incident coverage.
                </div>
                <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  <span className="truncate">Live sync enabled · Autosaved</span>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================
              CARD 3: CONVERT (4 Cols on desktop, 6 on tablet) - Amber / Yellow Gradient
              ======================================================== */}
          <div
            style={{ transitionDelay: isVisible ? '200ms' : '0ms' }}
            className={`col-span-1 md:col-span-6 lg:col-span-4 rounded-3xl p-4 sm:p-6 bg-gradient-to-br from-amber-300 via-amber-400 to-orange-300 border border-amber-300/40 flex flex-col justify-between transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100 hover:shadow-[0_0_35px_rgba(245,158,11,0.45)] relative overflow-hidden group ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
            }`}
          >
            {/* Header Content */}
            <div className="mb-4 sm:mb-5 relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/15 text-slate-900 text-xs font-semibold mb-2.5">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <span>Fidelity Engine</span>
              </div>
              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 tracking-tight mb-1.5 break-words">
                Convert Formats
              </h3>
              <p className="text-slate-800 text-xs sm:text-sm leading-relaxed break-words">
                Transform between PDF, Word, Excel, PowerPoint, and images with 100% vector retention.
              </p>
            </div>

            {/* Inner Light UI Preview */}
            <div className="bg-white/95 rounded-2xl p-3 sm:p-3.5 shadow-lg border border-white/80 space-y-2.5 relative z-10 w-full min-w-0">
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-red-100 text-red-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                    PDF
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 truncate">Q3_Financials.pdf</div>
                    <div className="text-[10px] text-slate-500 truncate">12.4 MB · 36 Pages</div>
                  </div>
                </div>
                <span className="text-xs font-bold text-amber-700 flex-shrink-0">→</span>
              </div>

              <div className="p-2 rounded-xl bg-blue-50/70 border border-blue-200/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                    DOC
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">Word (.docx)</div>
                    <div className="text-[10px] text-blue-700 font-medium truncate">Native table &amp; text styles</div>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded flex-shrink-0">
                  Ready
                </span>
              </div>

              <div className="flex justify-between items-center text-[11px] text-slate-500 pt-0.5 px-0.5 flex-wrap gap-1">
                <span>Speed: 1.2s</span>
                <span className="text-slate-700 font-medium">99.9% layout precision</span>
              </div>
            </div>
          </div>

          {/* ========================================================
              CARD 4: SIGN (4 Cols on desktop, 6 on tablet) - Rose / Pink Gradient
              ======================================================== */}
          <div
            style={{ transitionDelay: isVisible ? '300ms' : '0ms' }}
            className={`col-span-1 md:col-span-6 lg:col-span-4 rounded-3xl p-4 sm:p-6 bg-gradient-to-br from-rose-600 via-pink-600 to-rose-700 border border-rose-400/30 flex flex-col justify-between transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100 hover:shadow-[0_0_35px_rgba(244,63,94,0.45)] relative overflow-hidden group ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
            }`}
          >
            {/* Header Content */}
            <div className="mb-4 sm:mb-5 relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-semibold backdrop-blur-sm mb-2.5">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>eIDAS &amp; ESIGN</span>
              </div>
              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-white tracking-tight mb-1.5 break-words">
                Sign &amp; Certify
              </h3>
              <p className="text-rose-100 text-xs sm:text-sm leading-relaxed break-words">
                Add tamper-proof signatures, assign recipient fields, and track authenticated audit trails.
              </p>
            </div>

            {/* Inner Light UI Preview */}
            <div className="bg-white/95 rounded-2xl p-3 sm:p-3.5 shadow-lg border border-white/80 space-y-2.5 relative z-10 w-full min-w-0">
              <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-600 font-medium flex-wrap gap-1">
                  <span>Signatory: Alex Vance</span>
                  <span className="text-emerald-700 font-semibold bg-emerald-100 px-1.5 py-0.5 rounded flex-shrink-0">
                    Verified ID
                  </span>
                </div>

                {/* Handwritten Signature in Caveat */}
                <div className="bg-white rounded-lg p-2 border border-dashed border-rose-300 text-center">
                  <span className="font-signature text-2xl sm:text-3xl text-rose-600 font-medium block">
                    Alex Vance
                  </span>
                  <span className="text-[10px] text-slate-500 block">Digitally stamped: Oct 08, 2026</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-600 px-0.5 flex-wrap gap-1">
                <span className="flex items-center gap-1 text-slate-700">
                  <svg className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>256-Bit SHA Encrypted</span>
                </span>
                <span className="font-semibold text-slate-900 flex-shrink-0">Legally Binding</span>
              </div>
            </div>
          </div>

          {/* ========================================================
              CARD 5: ORGANIZE (4 Cols on desktop, 6 on tablet) - Emerald / Teal Gradient
              ======================================================== */}
          <div
            style={{ transitionDelay: isVisible ? '400ms' : '0ms' }}
            className={`col-span-1 md:col-span-6 lg:col-span-4 rounded-3xl p-4 sm:p-6 bg-gradient-to-br from-emerald-600 via-teal-600 to-teal-700 border border-emerald-400/30 flex flex-col justify-between transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100 hover:shadow-[0_0_35px_rgba(16,185,129,0.45)] relative overflow-hidden group ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
            }`}
          >
            {/* Header Content */}
            <div className="mb-4 sm:mb-5 relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-semibold backdrop-blur-sm mb-2.5">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span>Page Workbench</span>
              </div>
              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-white tracking-tight mb-1.5 break-words">
                Organize &amp; Merge
              </h3>
              <p className="text-emerald-100 text-xs sm:text-sm leading-relaxed break-words">
                Rearrange, merge bundles, split sections, and extract key pages in seconds with drag-and-drop ease.
              </p>
            </div>

            {/* Inner Light UI Preview */}
            <div className="bg-white/95 rounded-2xl p-3 sm:p-3.5 shadow-lg border border-white/80 space-y-2.5 relative z-10 w-full min-w-0">
              {/* Pages Grid */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 hover:border-slate-300 transition-colors">
                  <div className="w-full h-1 bg-slate-300 rounded mb-1" />
                  <div className="w-3/4 h-1 bg-slate-300 rounded mb-1.5" />
                  <span className="text-[10px] font-semibold text-slate-700">Page 1</span>
                </div>
                <div className="bg-emerald-50 border-2 border-emerald-500 rounded-lg p-1.5 ring-2 ring-emerald-400/20">
                  <div className="w-full h-1 bg-emerald-400 rounded mb-1" />
                  <div className="w-4/5 h-1 bg-emerald-400 rounded mb-1.5" />
                  <span className="text-[10px] font-bold text-emerald-800">Page 2</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 hover:border-slate-300 transition-colors">
                  <div className="w-full h-1 bg-slate-300 rounded mb-1" />
                  <div className="w-2/3 h-1 bg-slate-300 rounded mb-1.5" />
                  <span className="text-[10px] font-semibold text-slate-700">Page 3</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <button
                  type="button"
                  className="bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 rounded-lg py-1 px-1.5 sm:px-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1 min-h-[32px] sm:min-h-[36px]"
                >
                  <span className="text-sm leading-none font-bold">+</span> Add Files
                </button>
                <button
                  type="button"
                  className="bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 rounded-lg py-1 px-1.5 sm:px-2 text-xs font-medium transition-colors text-center min-h-[32px] sm:min-h-[36px]"
                >
                  Split / Rotate
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}