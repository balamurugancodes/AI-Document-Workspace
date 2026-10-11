import React, { useState, useEffect, useRef } from 'react';

// ── Typewriter Text Reveal Helper ───────────────────────────────────────────
function TypewriterText({ text, progress, isReducedMotion }) {
  if (isReducedMotion) {
    return <span>{text}</span>;
  }
  const count = Math.max(0, Math.min(text.length, Math.round(progress * text.length)));
  const visible = text.slice(0, count);
  const hidden = text.slice(count);

  return (
    <span aria-label={text}>
      <span>{visible}</span>
      <span className="opacity-0 select-none pointer-events-none" aria-hidden="true">
        {hidden}
      </span>
    </span>
  );
}

// ── Stage Indicator Circle with Scroll-Driven Progress Ring ──────────────────
function StageNode({ stepNumber, status, stageProgress, isDoneStage }) {
  // 1. Completed State
  if (status === 'completed') {
    if (isDoneStage) {
      // Done Stage Completion: Yellow Thumbs-Up 👍
      return (
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-amber-400 border-2 border-amber-400 text-slate-900 flex items-center justify-center shadow-[0_0_16px_rgba(251,191,36,0.55)] transition-all duration-200 scale-105 z-20">
          <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-slate-900" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 0 1 6 15.36V7.74c0-.406.16-.796.444-1.083a6.72 6.72 0 0 1 1.76-1.285c.677-.354 1.155-1.002 1.258-1.762l.067-.49a2.25 2.25 0 0 1 2.24-1.995c1.236 0 2.239 1.003 2.239 2.239 0 1.236-.5 2.45-1.22 3.25h4.688a2.25 2.25 0 0 1 2.213 2.684l-1.35 6.75a2.25 2.25 0 0 1-2.213 1.816H7.493Z" />
            <path d="M4.5 7.5A1.5 1.5 0 0 0 3 9v9a1.5 1.5 0 0 0 1.5 1.5h1.5A1.5 1.5 0 0 0 7.5 18V9A1.5 1.5 0 0 0 6 7.5H4.5Z" />
          </svg>
        </div>
      );
    }

    // Stages 1 & 2 Completion: Blue Checkmark ✓
    return (
      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-blue-600 border-2 border-blue-600 text-white flex items-center justify-center shadow-[0_0_14px_rgba(37,99,235,0.4)] transition-all duration-200 scale-105 z-20">
        <svg
          className="w-4 h-4 sm:w-5 sm:h-5 stroke-[3]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
    );
  }

  // 2. Active Processing State (Progress Ring fills directly with scroll)
  if (status === 'processing') {
    const circumference = 2 * Math.PI * 18; // radius = 18 => ~113.1
    const strokeDashoffset = circumference * (1 - Math.max(0, Math.min(1, stageProgress)));

    return (
      <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.25)] z-20">
        <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 44 44">
          <circle
            cx="22"
            cy="22"
            r="18"
            stroke="#cbd5e1"
            strokeWidth="3"
            fill="none"
            className="opacity-40"
          />
          <circle
            cx="22"
            cy="22"
            r="18"
            stroke="#2563eb"
            strokeWidth="3.2"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
        <span className="text-[10px] sm:text-[11px] font-extrabold text-blue-700 tracking-tight">
          {stepNumber}
        </span>
      </div>
    );
  }

  // 3. Idle Incomplete State
  return (
    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center text-slate-400 text-xs font-bold shadow-2xs z-20 transition-all duration-200">
      <span>{stepNumber}</span>
    </div>
  );
}

export default function HowItWorks() {
  const sectionRef = useRef(null);
  const pathDesktopRef = useRef(null);
  const pathMobileRef = useRef(null);
  const [scrollProgress, setScrollProgress] = useState(0); // 0.0 to 1.0
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  // Dynamic SVG Path Lengths
  const [desktopPathLength, setDesktopPathLength] = useState(820);
  const [mobilePathLength, setMobilePathLength] = useState(820);

  // 1. Detect prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(mediaQuery.matches);
    const handler = (e) => setIsReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // 2. Compute exact SVG path lengths on mount
  useEffect(() => {
    if (pathDesktopRef.current) {
      setDesktopPathLength(pathDesktopRef.current.getTotalLength());
    }
    if (pathMobileRef.current) {
      setMobilePathLength(pathMobileRef.current.getTotalLength());
    }
  }, []);

  // 3. Scroll Position Binding (Continuous & Reversible via requestAnimationFrame)
  useEffect(() => {
    let rafId = null;

    const handleScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!sectionRef.current) return;

        const rect = sectionRef.current.getBoundingClientRect();
        const winH = window.innerHeight;

        // Progress begins as the section crosses viewport threshold and finishes cleanly
        const startTrigger = winH * 0.6;
        const endTrigger = winH * 0.3;
        const totalDistance = rect.height - (startTrigger - endTrigger);
        const currentDistance = startTrigger - rect.top;

        const raw = currentDistance / Math.max(totalDistance, 1);
        const clamped = Math.max(0, Math.min(1, raw));
        setScrollProgress(clamped);
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    handleScroll(); // Initial measure

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // ── Stage Status & Progress Mapping (0-33%, 33-66%, 66-100%) ──────────────
  // Stage 1: Upload
  const stage1Status =
    scrollProgress >= 0.28 ? 'completed' : scrollProgress > 0.01 ? 'processing' : 'idle';
  const stage1Progress = Math.min(1, Math.max(0, scrollProgress / 0.28));

  // Stage 2: Work
  const stage2Status =
    scrollProgress >= 0.62 ? 'completed' : scrollProgress >= 0.33 ? 'processing' : 'idle';
  const stage2Progress = Math.min(1, Math.max(0, (scrollProgress - 0.33) / (0.62 - 0.33)));

  // Stage 3: Done
  const stage3Status =
    scrollProgress >= 0.9 ? 'completed' : scrollProgress >= 0.66 ? 'processing' : 'idle';
  const stage3Progress = Math.min(1, Math.max(0, (scrollProgress - 0.66) / (0.9 - 0.66)));

  // Final "Ready to download" CTA state (active at >= 0.90)
  const isReadyToDownload = scrollProgress >= 0.9;

  // ── Scroll-Driven Stage Text Entrance Reveals (Directional & Reversible) ─
  // Stage 1: Enters from the LEFT (0.00 – 0.18)
  const stage1Reveal = Math.min(1, Math.max(0, scrollProgress / 0.18));

  // Stage 2: Enters from the RIGHT (0.28 – 0.46)
  const stage2Reveal = Math.min(1, Math.max(0, (scrollProgress - 0.28) / 0.18));

  // Stage 3: Enters from the LEFT (0.60 – 0.78)
  const stage3Reveal = Math.min(1, Math.max(0, (scrollProgress - 0.6) / 0.18));

  // ── Scroll-Controlled Typewriter Progress for Stage Content ──────────────
  // Stage 1 Typewriter (0.00 – 0.22)
  const stage1TextProgress = Math.min(1, Math.max(0, scrollProgress / 0.22));
  const stage1TitleProg = Math.min(1, Math.max(0, stage1TextProgress / 0.35));
  const stage1DescProg = Math.min(1, Math.max(0, (stage1TextProgress - 0.2) / 0.8));

  // Stage 2 Typewriter (0.28 – 0.56)
  const stage2TextProgress = Math.min(1, Math.max(0, (scrollProgress - 0.28) / 0.28));
  const stage2TitleProg = Math.min(1, Math.max(0, stage2TextProgress / 0.35));
  const stage2DescProg = Math.min(1, Math.max(0, (stage2TextProgress - 0.2) / 0.8));

  // Stage 3 Typewriter (0.60 – 0.86)
  const stage3TextProgress = Math.min(1, Math.max(0, (scrollProgress - 0.6) / 0.26));
  const stage3TitleProg = Math.min(1, Math.max(0, stage3TextProgress / 0.35));
  const stage3DescProg = Math.min(1, Math.max(0, (stage3TextProgress - 0.2) / 0.8));

  // Blue River Path Offset Calculations
  const desktopOffset = desktopPathLength * (1 - scrollProgress);
  const mobileOffset = mobilePathLength * (1 - scrollProgress);

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      className="py-14 sm:py-24 lg:py-32 xl:py-36 bg-white border-t border-slate-100 text-slate-900 relative overflow-hidden"
    >
      {/* Component-Specific CSS for Slow Traveling CTA Gradient */}
      <style>{`
        @keyframes ctaGradientMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-cta-gradient {
          background-size: 200% 200%;
          animation: ctaGradientMove 7s ease infinite;
        }
      `}</style>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ========================================================\n            SECTION HEADER\n            ======================================================== */}
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-20 lg:mb-24">
          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-[11px] sm:text-xs font-semibold uppercase tracking-wider mb-3 sm:mb-4">
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-600 animate-pulse" />
            HOW IT WORKS
          </div>

          {/* Heading with explicit, prominent quotation marks */}
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-3 sm:mb-4 break-words">
            “From document to done.”
          </h2>

          <p className="text-slate-600 text-sm sm:text-base lg:text-lg leading-relaxed">
            Upload once. Work smarter. Finish faster.
          </p>
        </div>

        {/* ========================================================\n            SCROLL-CONTROLLED FLOWING RIVER WORKFLOW (Card-Free)\n            ======================================================== */}
        <div className="relative min-h-[760px] sm:min-h-[820px] md:min-h-[860px] flex flex-col justify-between">
          {/* ────────────────────────────────────────────────────────\n              1. DESKTOP FLOWING RIVER SVG PATH (Smooth S-Curves)\n              Strictly contained in a centered 192px corridor\n              Guarantees ample clearance from all stage text\n              ──────────────────────────────────────────────────────── */}
          <div className="hidden md:block absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-48 pointer-events-none z-0">
            <svg
              className="w-full h-full"
              viewBox="0 0 200 800"
              fill="none"
              preserveAspectRatio="none"
            >
              {/* Light Gray Base River Channel */}
              <path
                d="M 100 48 C 160 165, 160 280, 100 400 C 40 520, 40 635, 100 752"
                stroke="#e2e8f0"
                strokeWidth="4"
                strokeLinecap="round"
              />

              {/* Scroll-Driven Blue Progress River */}
              <path
                ref={pathDesktopRef}
                d="M 100 48 C 160 165, 160 280, 100 400 C 40 520, 40 635, 100 752"
                stroke="#2563eb"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeDasharray={desktopPathLength}
                strokeDashoffset={desktopOffset}
                className={isReducedMotion ? 'transition-none' : 'transition-[stroke-dashoffset] duration-75 ease-out'}
              />
            </svg>
          </div>

          {/* ────────────────────────────────────────────────────────\n              2. MOBILE FLOWING RIVER SVG PATH (Curved S-Shape)\n              Strictly contained in a left 48px corridor\n              Guarantees safe separation from mobile text\n              ──────────────────────────────────────────────────────── */}
          <div className="md:hidden absolute top-0 bottom-0 left-0 w-12 pointer-events-none z-0">
            <svg
              className="w-full h-full"
              viewBox="0 0 48 800"
              fill="none"
              preserveAspectRatio="none"
            >
              {/* Light Gray Base Path */}
              <path
                d="M 20 48 C 32 165, 8 280, 20 400 C 32 520, 8 635, 20 752"
                stroke="#e2e8f0"
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* Scroll-Driven Blue Path */}
              <path
                ref={pathMobileRef}
                d="M 20 48 C 32 165, 8 280, 20 400 C 32 520, 8 635, 20 752"
                stroke="#2563eb"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={mobilePathLength}
                strokeDashoffset={mobileOffset}
                className={isReducedMotion ? 'transition-none' : 'transition-[stroke-dashoffset] duration-75 ease-out'}
              />
            </svg>
          </div>

          {/* ========================================================\n              STAGE 01: UPLOAD (0 – 33% Range)\n              ======================================================== */}
          <div className="relative flex flex-col md:flex-row items-start md:items-center w-full z-10 pt-1 sm:pt-2">
            {/* Desktop Left Side: Narrative (Enters from LEFT with Typewriter Reveal) */}
            <div
              style={{
                opacity: isReducedMotion ? 1 : stage1Reveal,
                transform: isReducedMotion ? 'none' : `translateX(${(1 - stage1Reveal) * -24}px)`,
                transition: isReducedMotion ? 'none' : 'opacity 0.2s ease-out, transform 0.2s ease-out',
              }}
              className="w-full md:w-1/2 md:pr-14 lg:pr-24 pl-14 sm:pl-16 md:pl-0 md:text-right min-w-0"
            >
              <span className="text-[11px] sm:text-xs font-extrabold text-blue-600 tracking-wider block mb-1">
                01 — STAGE
              </span>
              <h3 className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight mb-1.5 sm:mb-2 break-words">
                <TypewriterText text="Upload" progress={stage1TitleProg} isReducedMotion={isReducedMotion} />
              </h3>
              <p className="text-slate-600 text-xs sm:text-sm md:text-base leading-relaxed max-w-sm md:ml-auto break-words">
                <TypewriterText
                  text="Bring your PDF or document into your workspace."
                  progress={stage1DescProg}
                  isReducedMotion={isReducedMotion}
                />
              </p>
            </div>

            {/* Central Node Indicator */}
            <div className="absolute left-0 md:left-1/2 md:-translate-x-1/2 top-0 md:top-auto">
              <StageNode
                stepNumber="01"
                status={stage1Status}
                stageProgress={stage1Progress}
                isDoneStage={false}
              />
            </div>

            {/* Desktop Right Side: Minimal File Preview (Enters smoothly from RIGHT) */}
            <div
              style={{
                opacity: isReducedMotion ? 1 : stage1Reveal,
                transform: isReducedMotion ? 'none' : `translateX(${(1 - stage1Reveal) * 24}px)`,
                transition: isReducedMotion ? 'none' : 'opacity 0.2s ease-out, transform 0.2s ease-out',
              }}
              className="w-full md:w-1/2 md:pl-14 lg:pl-24 pl-14 sm:pl-16 md:pl-0 mt-3 md:mt-0 flex justify-start min-w-0"
            >
              <div className="inline-flex items-center gap-2.5 sm:gap-3.5 py-2 sm:py-2.5 px-3 sm:px-4 rounded-xl bg-slate-50 border border-slate-200/90 text-left transition-all duration-300 max-w-full">
                <div className="w-8 h-9 sm:w-9 sm:h-10 rounded bg-red-500/10 border border-red-500/20 flex flex-col items-center justify-center text-[9px] font-extrabold text-red-600 flex-shrink-0">
                  PDF
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 tracking-tight truncate">
                    document.pdf
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                    24 pages • 2.4 MB
                  </p>
                </div>
                <span
                  className={`ml-1.5 sm:ml-2 w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-300 ${
                    stage1Status === 'completed' ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* ========================================================\n              STAGE 02: WORK (33 – 66% Range)\n              ======================================================== */}
          <div className="relative flex flex-col md:flex-row items-start md:items-center w-full z-10 py-10 sm:py-12 md:py-0">
            {/* Desktop Left Side: Minimal Workspace Toolbar Preview (Enters from LEFT) */}
            <div
              style={{
                opacity: isReducedMotion ? 1 : stage2Reveal,
                transform: isReducedMotion ? 'none' : `translateX(${(1 - stage2Reveal) * -24}px)`,
                transition: isReducedMotion ? 'none' : 'opacity 0.2s ease-out, transform 0.2s ease-out',
              }}
              className="hidden md:flex w-1/2 pr-14 lg:pr-24 justify-end min-w-0"
            >
              <div className="inline-flex flex-col gap-2 text-left max-w-full">
                {/* Micro Toolbar */}
                <div className="inline-flex items-center gap-1.5 p-1 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-600 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-white text-blue-600 font-bold shadow-2xs border border-slate-200/60">
                    Edit
                  </span>
                  <span className="px-2 py-0.5 hover:text-slate-900">Analyze</span>
                  <span className="px-2 py-0.5 hover:text-slate-900">Convert</span>
                  <span className="px-2 py-0.5 hover:text-slate-900">Sign</span>
                </div>
                {/* Subtle document line indicators */}
                <div className="w-48 lg:w-52 p-2.5 rounded-lg bg-white border border-slate-200/90 shadow-2xs space-y-1.5">
                  <div className="h-1.5 w-3/4 bg-slate-800 rounded-xs" />
                  <div className="h-1.5 w-full bg-slate-200 rounded-xs" />
                  <div className="h-1.5 w-4/5 bg-slate-200 rounded-xs" />
                </div>
              </div>
            </div>

            {/* Central Node Indicator */}
            <div className="absolute left-0 md:left-1/2 md:-translate-x-1/2 top-0 md:top-auto">
              <StageNode
                stepNumber="02"
                status={stage2Status}
                stageProgress={stage2Progress}
                isDoneStage={false}
              />
            </div>

            {/* Desktop Right Side: Narrative (Enters from RIGHT with Typewriter Reveal) */}
            <div
              style={{
                opacity: isReducedMotion ? 1 : stage2Reveal,
                transform: isReducedMotion ? 'none' : `translateX(${(1 - stage2Reveal) * 24}px)`,
                transition: isReducedMotion ? 'none' : 'opacity 0.2s ease-out, transform 0.2s ease-out',
              }}
              className="w-full md:w-1/2 md:pl-14 lg:pl-24 pl-14 sm:pl-16 md:pl-0 md:text-left min-w-0"
            >
              <span className="text-[11px] sm:text-xs font-extrabold text-blue-600 tracking-wider block mb-1">
                02 — STAGE
              </span>
              <h3 className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight mb-1.5 sm:mb-2 break-words">
                <TypewriterText text="Work" progress={stage2TitleProg} isReducedMotion={isReducedMotion} />
              </h3>
              <p className="text-slate-600 text-xs sm:text-sm md:text-base leading-relaxed max-w-sm break-words">
                <TypewriterText
                  text="Edit, analyze, convert, sign, and organize everything in one focused workspace."
                  progress={stage2DescProg}
                  isReducedMotion={isReducedMotion}
                />
              </p>

              {/* Mobile-only Preview */}
              <div className="md:hidden mt-3 inline-flex flex-col gap-2 text-left max-w-full">
                <div className="inline-flex items-center gap-1 sm:gap-1.5 p-1 rounded-lg bg-slate-100 border border-slate-200 text-[10px] sm:text-[11px] font-semibold text-slate-600 flex-wrap">
                  <span className="px-1.5 sm:px-2 py-0.5 rounded bg-white text-blue-600 font-bold border border-slate-200/60 shadow-2xs">
                    Edit
                  </span>
                  <span className="px-1.5 sm:px-2 py-0.5">Analyze</span>
                  <span className="px-1.5 sm:px-2 py-0.5">Convert</span>
                  <span className="px-1.5 sm:px-2 py-0.5">Sign</span>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================\n              STAGE 03: DONE (66 – 100% Range)\n              ======================================================== */}
          <div className="relative flex flex-col md:flex-row items-start md:items-center w-full z-10 pb-1 sm:pb-2">
            {/* Desktop Left Side: Narrative (Enters from LEFT with Typewriter Reveal) */}
            <div
              style={{
                opacity: isReducedMotion ? 1 : stage3Reveal,
                transform: isReducedMotion ? 'none' : `translateX(${(1 - stage3Reveal) * -24}px)`,
                transition: isReducedMotion ? 'none' : 'opacity 0.2s ease-out, transform 0.2s ease-out',
              }}
              className="w-full md:w-1/2 md:pr-14 lg:pr-24 pl-14 sm:pl-16 md:pl-0 md:text-right min-w-0"
            >
              <span className="text-[11px] sm:text-xs font-extrabold text-blue-600 tracking-wider block mb-1">
                03 — STAGE
              </span>
              <h3 className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight mb-1.5 sm:mb-2 break-words">
                <TypewriterText text="Done" progress={stage3TitleProg} isReducedMotion={isReducedMotion} />
              </h3>
              <p className="text-slate-600 text-xs sm:text-sm md:text-base leading-relaxed max-w-sm md:ml-auto break-words">
                <TypewriterText
                  text="Save, share, or download your finished document."
                  progress={stage3DescProg}
                  isReducedMotion={isReducedMotion}
                />
              </p>
            </div>

            {/* Central Node Indicator (Finishes with YELLOW Thumbs-Up 👍) */}
            <div className="absolute left-0 md:left-1/2 md:-translate-x-1/2 top-0 md:top-auto">
              <StageNode
                stepNumber="03"
                status={stage3Status}
                stageProgress={stage3Progress}
                isDoneStage={true}
              />
            </div>

            {/* Desktop Right Side: Completion Preview + Animated Gradient CTA (Enters from RIGHT) */}
            <div
              style={{
                opacity: isReducedMotion ? 1 : stage3Reveal,
                transform: isReducedMotion ? 'none' : `translateX(${(1 - stage3Reveal) * 24}px)`,
                transition: isReducedMotion ? 'none' : 'opacity 0.2s ease-out, transform 0.2s ease-out',
              }}
              className="w-full md:w-1/2 md:pl-14 lg:pr-0 lg:pl-24 pl-14 sm:pl-16 md:pl-0 mt-3 md:mt-0 flex flex-col items-start gap-2.5 sm:gap-3 min-w-0"
            >
              {/* Exported Document State */}
              <div className="inline-flex items-center gap-2.5 sm:gap-3.5 py-1.5 sm:py-2 px-3 sm:px-4 rounded-xl bg-slate-50 border border-slate-200/90 text-left transition-all duration-300 max-w-full">
                <div
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-300 ${
                    stage3Status === 'completed'
                      ? 'bg-amber-400 text-slate-900'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  <svg
                    className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    document_final.pdf
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                    Exported · Signed &amp; Verified
                  </p>
                </div>
              </div>

              {/* Final "Ready to download" CTA with Slow Blue → Violet → Rose Gradient & Soft Glow */}
              <div
                style={{
                  opacity: isReadyToDownload ? 1 : 0,
                  transform: isReadyToDownload ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.96)',
                  transition: isReducedMotion ? 'none' : 'opacity 0.35s ease-out, transform 0.35s ease-out',
                  pointerEvents: isReadyToDownload ? 'auto' : 'none',
                }}
                className="max-w-full"
              >
                <div className="relative inline-flex items-center gap-2 sm:gap-2.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-white text-xs sm:text-sm font-semibold tracking-wide shadow-[0_4px_22px_rgba(124,58,237,0.3)] bg-gradient-to-r from-blue-600 via-violet-600 to-rose-500 animate-cta-gradient cursor-default select-none max-w-full">
                  <svg
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white stroke-[2.5] flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                    />
                  </svg>
                  <span className="truncate">Ready to download</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}