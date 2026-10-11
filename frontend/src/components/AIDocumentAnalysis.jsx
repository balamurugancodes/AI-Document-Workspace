import React, { useState, useEffect, useRef } from 'react';

// ── Shared Star Icon ────────────────────────────────────────────────────────
function StarIcon() {
  return (
    <svg
      className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-amber-400 text-amber-400 flex-shrink-0"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

export default function AIDocumentAnalysis() {
  const sectionRef = useRef(null);
  const [isInView, setIsInView] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [scanState, setScanState] = useState('idle'); // 'idle' | 'scanning' | 'paused'

  // 1. Check prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(mediaQuery.matches);

    const handler = (e) => setIsReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // 2. Viewport IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    const currentEl = sectionRef.current;
    if (currentEl) {
      observer.observe(currentEl);
    }

    return () => {
      if (currentEl) {
        observer.unobserve(currentEl);
      }
      observer.disconnect();
    };
  }, []);

  // 3. Continuous Scanning Loop:
  // "Top → slowly travel (3.5s) → Bottom → wait 3s → Top → repeat"
  useEffect(() => {
    if (!isInView || isReducedMotion) {
      setScanState('idle');
      return;
    }

    let scanTimer = null;
    let pauseTimer = null;
    let resetTimer = null;
    let isActive = true;

    const runScanCycle = () => {
      if (!isActive) return;

      // 1. Start slow top-to-bottom scan
      setScanState('scanning');

      // 3.5 seconds to travel smoothly from top to bottom
      scanTimer = setTimeout(() => {
        if (!isActive) return;

        // 2. Reached bottom: stop and pause for 3 seconds
        setScanState('paused');

        pauseTimer = setTimeout(() => {
          if (!isActive) return;

          // 3. Reset line to top instantaneously
          setScanState('idle');

          // 4. Brief delay before launching next scan cycle
          resetTimer = setTimeout(() => {
            if (!isActive) return;
            runScanCycle();
          }, 60);
        }, 3000); // Wait 3 seconds
      }, 3500); // 3.5s scan duration
    };

    runScanCycle();

    return () => {
      isActive = false;
      clearTimeout(scanTimer);
      clearTimeout(pauseTimer);
      clearTimeout(resetTimer);
    };
  }, [isInView, isReducedMotion]);

  return (
    <section
      ref={sectionRef}
      id="ai-analysis"
      className="py-12 sm:py-20 lg:py-28 bg-[#000000] border-t border-neutral-900 text-white relative overflow-hidden"
    >
      {/* Container anchored close to the left edge with clean responsive padding */}
      <div className="w-full px-3.5 sm:px-6 lg:pl-6 lg:pr-12 max-w-[1600px] mr-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 xl:gap-16 items-center">
          {/* ========================================================
              LEFT COLUMN: LARGE PROFESSIONAL DOCUMENT PREVIEW
              Anchored close to left edge + Thick slow red scanning line
              ======================================================== */}
          <div className="lg:col-span-7 w-full flex justify-start">
            <div className="w-full max-w-[740px] relative bg-white rounded-2xl border border-slate-300 shadow-2xl p-4 sm:p-7 md:p-9 lg:p-11 overflow-hidden select-none text-slate-900 min-h-[480px] sm:min-h-[580px] lg:min-h-[690px] flex flex-col justify-between">
              {/* Document Inner Content */}
              <div>
                {/* Header Metadata */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-200 pb-2.5 sm:pb-3.5 mb-3.5 sm:mb-5 text-[9.5px] sm:text-[11px] font-semibold text-slate-500">
                  <span className="uppercase tracking-wider sm:tracking-widest text-slate-600 truncate max-w-full">
                    CONFIDENTIAL LEGAL INSTRUMENT · REV. 2026.4
                  </span>
                  <span className="bg-slate-100 text-slate-700 px-1.5 sm:px-2 py-0.5 rounded font-mono text-[9px] sm:text-[10.5px] border border-slate-200 whitespace-nowrap">
                    AGREEMENT ID: #MSA-2026-88
                  </span>
                </div>

                {/* Document Main Heading */}
                <div className="mb-4 sm:mb-6">
                  <h4 className="text-base sm:text-xl lg:text-2xl font-extrabold text-slate-900 tracking-tight leading-tight break-words">
                    MASTER SERVICES AGREEMENT
                  </h4>
                  <p className="text-[11px] sm:text-xs lg:text-[13px] text-slate-600 mt-1 sm:mt-1.5 leading-snug sm:leading-normal break-words">
                    By and Between Apex Solutions Enterprise Inc. &amp; Global Corporate Partner LLC
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 break-words">
                    Effective Date: October 08, 2026 · Jurisdiction: State of Delaware
                  </p>
                </div>

                {/* Clause 1 */}
                <div className="space-y-1 sm:space-y-1.5 mb-3.5 sm:mb-5 text-[10.5px] sm:text-xs lg:text-[12.5px]">
                  <h5 className="font-bold text-slate-900 tracking-tight text-[10.5px] sm:text-[11px] lg:text-[12px] uppercase break-words">
                    1. Purpose &amp; Scope of Operative Deliverables
                  </h5>
                  <p className="text-slate-700 leading-relaxed text-[10px] sm:text-[11px] lg:text-xs break-words">
                    The Service Provider shall deliver full-cycle intelligent document architecture, automated ingestion pipelines, and repository integrations as detailed in Schedule A. All deliverables must satisfy ISO-27001 data governance and SOC2 Type II compliance standards.
                  </p>
                </div>

                {/* Clause 2 */}
                <div className="space-y-1 sm:space-y-1.5 mb-3.5 sm:mb-5 text-[10.5px] sm:text-xs lg:text-[12.5px]">
                  <h5 className="font-bold text-slate-900 tracking-tight text-[10.5px] sm:text-[11px] lg:text-[12px] uppercase break-words">
                    2. Compensation &amp; Invoicing Schedule
                  </h5>
                  <p className="text-slate-700 leading-relaxed text-[10px] sm:text-[11px] lg:text-xs break-words">
                    Invoices shall be rendered on the first calendar business day of each billing cycle. All undisputed amounts are payable within thirty (30) calendar days from receipt via verified corporate electronic transfer. Retainer commitments remain fixed for the initial operative term.
                  </p>
                </div>

                {/* Information / Micro-Table Area */}
                <div className="my-3.5 sm:my-5 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 sm:p-3.5 lg:p-4 text-[10px] sm:text-[11.5px] lg:text-xs overflow-hidden">
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pb-2 sm:pb-2.5 mb-2 sm:mb-2.5 border-b border-slate-200 font-bold text-slate-500 text-[9px] sm:text-[10px] lg:text-[10.5px] uppercase tracking-wider">
                    <span>Key Clause</span>
                    <span>Terms &amp; Specifications</span>
                    <span className="text-right">Compliance Status</span>
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-slate-700 items-center text-[9.5px] sm:text-[11px] lg:text-xs">
                      <span className="font-semibold text-slate-900 break-words">Term Duration</span>
                      <span className="break-words">12 Calendar Months</span>
                      <span className="text-right text-emerald-600 font-semibold whitespace-nowrap">● Operative</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-slate-700 items-center text-[9.5px] sm:text-[11px] lg:text-xs">
                      <span className="font-semibold text-slate-900 break-words">Termination Notice</span>
                      <span className="break-words">30-Day Written Formal Notice</span>
                      <span className="text-right text-blue-600 font-semibold whitespace-nowrap">● Verified</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-slate-700 items-center text-[9.5px] sm:text-[11px] lg:text-xs">
                      <span className="font-semibold text-slate-900 break-words">Governing Law</span>
                      <span className="break-words">Delaware Commercial Code</span>
                      <span className="text-right text-slate-500 font-semibold whitespace-nowrap">● Standard</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-slate-700 items-center text-[9.5px] sm:text-[11px] lg:text-xs">
                      <span className="font-semibold text-slate-900 break-words">Data Covenants</span>
                      <span className="break-words">36-Month Non-Disclosure</span>
                      <span className="text-right text-indigo-600 font-semibold whitespace-nowrap">● Compliant</span>
                    </div>
                  </div>
                </div>

                {/* Clause 3 */}
                <div className="space-y-1 sm:space-y-1.5 mb-3.5 sm:mb-5 text-[10.5px] sm:text-xs lg:text-[12.5px]">
                  <h5 className="font-bold text-slate-900 tracking-tight text-[10.5px] sm:text-[11px] lg:text-[12px] uppercase break-words">
                    3. Intellectual Property &amp; Confidential Information
                  </h5>
                  <p className="text-slate-700 leading-relaxed text-[10px] sm:text-[11px] lg:text-xs break-words">
                    All proprietary algorithms, client schemas, and technical assets remain the exclusive property of the commissioning entity. Strict non-disclosure obligations shall survive contract expiration for an enduring term of 36 months.
                  </p>
                </div>
              </div>

              {/* Signatures Snippet */}
              <div className="pt-3 sm:pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[9.5px] sm:text-[10.5px] lg:text-[11px] text-slate-600">
                <div className="min-w-0">
                  <span className="block font-semibold text-slate-900 truncate">Authorized: Alex Vance</span>
                  <span className="text-slate-500 truncate block">VP Operations · Apex Solutions</span>
                </div>
                <div className="text-right min-w-0">
                  <span className="block font-semibold text-slate-900 truncate">Counterpart: Sarah Jenkins</span>
                  <span className="text-slate-500 truncate block">General Counsel · Partner Corp</span>
                </div>
              </div>

              {/* ========================================================
                  THICK, CLEARLY VISIBLE RED AI SCANNING BEAM
                  Slow Smooth Travel: 3.5s scan duration + 3s bottom pause
                  ======================================================== */}
              {!isReducedMotion && (
                <div
                  className="absolute left-0 right-0 pointer-events-none z-20"
                  style={{
                    top: scanState === 'idle' ? '0%' : '100%',
                    transition:
                      scanState === 'scanning'
                        ? 'top 3500ms linear'
                        : 'none',
                    opacity: scanState === 'idle' ? 0 : 1,
                  }}
                >
                  {/* Soft upper red gradient wash */}
                  <div className="w-full h-12 sm:h-16 -mt-12 sm:-mt-16 bg-gradient-to-t from-red-500/25 via-red-500/8 to-transparent pointer-events-none" />

                  {/* Noticeably thicker, vibrant red laser scanning line with rich glow */}
                  <div className="w-full h-[3px] sm:h-[3.5px] bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.95),0_0_24px_rgba(239,68,68,0.55),0_0_36px_rgba(239,68,68,0.3)]" />

                  {/* Soft lower trailing edge */}
                  <div className="w-full h-3 sm:h-4 bg-gradient-to-b from-red-500/20 to-transparent pointer-events-none" />

                  {/* Clear Scanning Status Badge */}
                  <div className="absolute right-2 sm:right-4 -top-3.5 sm:-top-4 bg-red-600 text-white text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md shadow-md flex items-center gap-1 sm:gap-1.5 border border-red-400/40 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white animate-pulse" />
                    AI Document Scanning
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================
              RIGHT COLUMN: PROMINENT HEADING & CLEAN PLAIN TEXT LAYOUT
              ======================================================== */}
          <div className="lg:col-span-5 w-full space-y-4 sm:space-y-5 lg:space-y-6">
            {/* Intro Header */}
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 border border-white/20 text-white text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider mb-2.5 sm:mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                AI DOCUMENT ANALYSIS
              </div>

              {/* Restored Large Prominent Main Heading */}
              <h2
                className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight mb-2.5 sm:mb-3 break-words"
                style={{ color: '#ffffff' }}
              >
                Understand every document faster.
              </h2>

              <p className="text-slate-300 text-xs sm:text-[13px] md:text-sm leading-relaxed max-w-lg break-words">
                AI Document Analyzer instantly parses dense contracts, financial decks, and agreements to extract key topics, highlight binding clauses, and deliver an executive summary in seconds.
              </p>
            </div>

            {/* Clean Plain Text Analysis Sections */}
            <div className="space-y-3 sm:space-y-3.5 sm:space-y-4 pt-0.5">
              {/* 1. Document Type */}
              <div
                style={{ transitionDelay: isReducedMotion ? '0ms' : '0ms' }}
                className={`transition-all duration-500 ease-out ${
                  isInView || isReducedMotion
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-2'
                }`}
              >
                <span className="block text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-white mb-0.5">
                  Document Type
                </span>
                <p className="text-xs sm:text-[13px] md:text-sm font-semibold text-slate-200 break-words">
                  Business Agreement
                </p>
              </div>

              {/* 2. Key Topics */}
              <div
                style={{ transitionDelay: isReducedMotion ? '0ms' : '100ms' }}
                className={`transition-all duration-500 ease-out ${
                  isInView || isReducedMotion
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-2'
                }`}
              >
                <span className="block text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-white mb-0.5">
                  Key Topics
                </span>
                <p className="text-xs sm:text-[13px] md:text-sm font-medium text-slate-300 break-words">
                  Payment Terms · Responsibilities · Termination
                </p>
              </div>

              {/* 3. Important Information */}
              <div
                style={{ transitionDelay: isReducedMotion ? '0ms' : '200ms' }}
                className={`transition-all duration-500 ease-out ${
                  isInView || isReducedMotion
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-2'
                }`}
              >
                <span className="block text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-white mb-0.5">
                  Important Information
                </span>
                <p className="text-xs sm:text-[13px] md:text-sm font-medium text-slate-300 break-words">
                  12-month agreement · 30-day notice
                </p>
              </div>

              {/* 4. AI Summary */}
              <div
                style={{ transitionDelay: isReducedMotion ? '0ms' : '300ms' }}
                className={`transition-all duration-500 ease-out ${
                  isInView || isReducedMotion
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-2'
                }`}
              >
                <span className="block text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-white mb-0.5">
                  AI Summary
                </span>
                <p className="text-xs sm:text-[13px] md:text-sm leading-relaxed text-slate-300 font-normal break-words">
                  A professional agreement outlining responsibilities, payment terms, and termination conditions between two parties.
                </p>
              </div>
            </div>

            {/* ========================================================
                TRUST & REVIEW AREA
                ======================================================== */}
            <div className="pt-3.5 sm:pt-5 border-t border-white/15">
              {/* 5 Gold Stars */}
              <div className="flex items-center gap-1 mb-1.5 sm:mb-2">
                {[...Array(5)].map((_, i) => (
                  <StarIcon key={i} />
                ))}
                <span className="text-[10px] sm:text-[11px] font-bold text-white ml-1">
                  5.0 Rating
                </span>
              </div>

              {/* Compact Review */}
              <blockquote className="text-[11.5px] sm:text-[12px] md:text-[13px] text-slate-300 leading-relaxed font-normal mb-1 break-words">
                "The AI document analysis cuts our contract review turnaround by over 70%. It catches subtle liability clauses, pinpoints payment terms, and provides instant clarity for our legal and operations teams."
              </blockquote>

              <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium break-words">
                — Marcus Vance, Head of Legal Operations at Crestview Partners
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}