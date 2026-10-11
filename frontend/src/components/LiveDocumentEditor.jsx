import React, { useState, useEffect, useRef, useCallback } from 'react';

const INITIAL_HEADING_STATE = {
  text: 'SERVICE AGREEMENT',
  fontFamily: 'Lexend, sans-serif',
  fontSize: '28px',
  bold: true,
  italic: false,
  underline: false,
  color: '#0f172a',
  align: 'left',
};

const FEATURE_LIST = [
  'Edit text directly',
  'Change fonts & formatting',
  'Adjust colors and alignment',
  'See changes instantly',
];

export default function LiveDocumentEditor() {
  const sectionRef = useRef(null);
  const headingRef = useRef(null);
  const draftTextRef = useRef(INITIAL_HEADING_STATE.text);
  const debounceTimerRef = useRef(null);
  const savedSelectionRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  // Undo / Redo history stack storing full snapshots of text & formatting
  const [history, setHistory] = useState([INITIAL_HEADING_STATE]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const current = history[historyIndex];

  // Save current heading selection range
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (
      sel &&
      sel.rangeCount > 0 &&
      headingRef.current &&
      headingRef.current.contains(sel.anchorNode)
    ) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  // Restore saved heading selection range
  const restoreSelection = useCallback(() => {
    if (savedSelectionRef.current && headingRef.current) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedSelectionRef.current);
      }
    }
  }, []);

  // Helper to commit a state into history
  const pushHistoryState = useCallback((nextState) => {
    setHistory((prev) => {
      const updated = prev.slice(0, historyIndex + 1);
      const last = updated[updated.length - 1];
      if (
        last &&
        last.text === nextState.text &&
        last.bold === nextState.bold &&
        last.italic === nextState.italic &&
        last.underline === nextState.underline &&
        last.fontFamily === nextState.fontFamily &&
        last.fontSize === nextState.fontSize &&
        last.color === nextState.color &&
        last.align === nextState.align
      ) {
        return updated;
      }
      updated.push(nextState);
      return updated;
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  // Synchronize the DOM text only when history changes externally (e.g. Undo/Redo)
  useEffect(() => {
    if (headingRef.current && headingRef.current.textContent !== current.text) {
      headingRef.current.textContent = current.text;
      draftTextRef.current = current.text;
    }
  }, [current.text]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Handle typing inside heading without creating a history entry per keystroke
  const handleHeadingInput = (e) => {
    const newText = e.currentTarget.textContent || '';
    draftTextRef.current = newText;
    saveSelection();

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Group typing bursts into a single history snapshot after 750ms pause
    debounceTimerRef.current = setTimeout(() => {
      if (newText !== current.text) {
        pushHistoryState({
          ...current,
          text: newText,
        });
      }
    }, 750);
  };

  // Commit text when user finishes editing / leaves heading
  const handleHeadingBlur = () => {
    saveSelection();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const latestText = draftTextRef.current;
    if (latestText !== current.text) {
      pushHistoryState({
        ...current,
        text: latestText,
      });
    }
  };

  // Apply formatting changes (flushes any in-progress typing first)
  const applyFormatting = (styleUpdates) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const nextState = {
      ...current,
      text: draftTextRef.current,
      ...styleUpdates,
    };

    pushHistoryState(nextState);
  };

  // Format toggles affecting ONLY the heading
  const toggleBold = () => applyFormatting({ bold: !current.bold });
  const toggleItalic = () => applyFormatting({ italic: !current.italic });
  const toggleUnderline = () => applyFormatting({ underline: !current.underline });
  const changeFontFamily = (fontFamily) => {
    applyFormatting({ fontFamily });
    restoreSelection();
  };
  const changeFontSize = (fontSize) => {
    applyFormatting({ fontSize });
    restoreSelection();
  };
  const changeColor = (color) => {
    applyFormatting({ color });
    restoreSelection();
  };
  const changeAlign = (align) => applyFormatting({ align });

  // Undo restores both text and formatting
  const handleUndo = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // If user has uncommitted typing, undo to the current checkpoint first
    if (draftTextRef.current !== current.text) {
      draftTextRef.current = current.text;
      if (headingRef.current) {
        headingRef.current.textContent = current.text;
      }
      return;
    }

    if (historyIndex > 0) {
      setHistoryIndex((prev) => prev - 1);
    }
  };

  // Redo restores both text and formatting
  const handleRedo = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (historyIndex < history.length - 1) {
      setHistoryIndex((prev) => prev + 1);
    }
  };

  // Prevent toolbar button clicks from stealing focus/selection from the heading
  const preventFocusLoss = (e) => {
    e.preventDefault();
  };

  // Scroll entrance observer
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const canUndo = historyIndex > 0 || draftTextRef.current !== current.text;
  const canRedo = historyIndex < history.length - 1;

  return (
    <section
      ref={sectionRef}
      id="live-editor"
      className="py-16 sm:py-24 lg:py-32 xl:py-36 bg-slate-950 text-white relative overflow-hidden"
    >
      <div className="w-full max-w-[1440px] mx-auto pl-4 sm:pl-6 lg:pl-10 pr-4 sm:pr-6 lg:pr-0">
        <div
          className={`grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-10 lg:gap-14 items-start transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
          }`}
        >
          {/* ========================================================
              LEFT SIDE: Product & Feature Explanation
              ======================================================== */}
          <div className="lg:col-span-5 space-y-5 sm:space-y-6 pt-1 sm:pt-2 lg:pt-8 pr-0 lg:pr-4 min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                Live editing
              </span>
              <span className="text-[11px] sm:text-xs uppercase font-semibold tracking-wider text-slate-400">
                LIVE DOCUMENT EDITOR
              </span>
            </div>

            <h2
              className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight break-words"
              style={{ color: '#ffffff' }}
            >
              Edit documents. See every change instantly.
            </h2>

            <p className="text-white text-sm sm:text-base lg:text-lg leading-relaxed break-words" style={{ color: '#ffffff' }}>
              Make precise edits directly inside your document with a simple, focused editing experience.
            </p>

            {/* Feature List With Sequential Animation */}
            <ul className="space-y-2.5 sm:space-y-3.5 pt-1">
              {FEATURE_LIST.map((feature, index) => (
                <li
                  key={feature}
                  style={{
                    transitionDelay: isVisible ? `${100 + index * 100}ms` : '0ms',
                    color: '#ffffff',
                  }}
                  className={`flex items-center gap-2.5 sm:gap-3 text-white text-xs sm:text-sm lg:text-base font-normal transition-all duration-500 ease-out motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100 ${
                    isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                  }`}
                >
                  <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] sm:text-xs font-bold shrink-0">
                    ✓
                  </span>
                  <span className="text-white break-words" style={{ color: '#ffffff' }}>
                    {feature}
                  </span>
                </li>
              ))}
            </ul>

            {/* Divider 1 */}
            <div className="border-t border-slate-800/80 pt-3 sm:pt-4" />

            {/* Supporting Text Paragraph */}
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-[380px] break-words">
              Make every document change with clarity, control, and confidence.
            </p>

            {/* Divider 2 */}
            <div className="border-t border-slate-800/80 pt-3 sm:pt-4" />

            {/* Subtle Rating & 4-Line Review */}
            <div className="space-y-2 sm:space-y-2.5">
              <div className="flex items-center gap-1.5 text-amber-400 text-base sm:text-lg lg:text-xl tracking-wider select-none">
                ★★★★★
              </div>
              <div className="text-xs sm:text-sm lg:text-base leading-relaxed max-w-sm space-y-1">
                <p className="text-slate-400">“Editing documents feels much simpler now.</p>
                <p className="text-slate-400">Everything stays clean and easy to control.</p>
                <p className="text-white font-medium" style={{ color: '#ffffff' }}>
                  I can make changes without breaking my workflow.
                </p>
                <p className="text-white font-medium" style={{ color: '#ffffff' }}>
                  It just feels effortless.”
                </p>
              </div>
            </div>
          </div>

          {/* ========================================================
              RIGHT SIDE: Large Document (Attached Flush to Right Edge)
              ======================================================== */}
          <div className="lg:col-span-7 flex justify-end w-full min-w-0">
            <div className="w-full bg-white rounded-2xl lg:rounded-l-3xl lg:rounded-r-none shadow-2xl border border-slate-200/90 lg:border-r-0 overflow-hidden text-slate-900 transition-all duration-300">
              {/* Attached Document Toolbar */}
              <div className="bg-slate-50/95 border-b border-slate-200 px-2.5 sm:px-4 lg:px-5 py-2.5 sm:py-3 flex flex-wrap items-center gap-1 sm:gap-1.5 sm:gap-2">
                {/* Font Family Selector */}
                <select
                  value={current.fontFamily}
                  onMouseDown={saveSelection}
                  onChange={(e) => changeFontFamily(e.target.value)}
                  className="bg-white text-slate-800 text-[11px] sm:text-xs border border-slate-300 rounded px-2 py-1 sm:px-2.5 sm:py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[110px] xs:max-w-[130px] sm:max-w-none truncate"
                  title="Font Family"
                >
                  <option value="Lexend, sans-serif">Lexend (Display)</option>
                  <option value="Manrope, sans-serif">Manrope (Clean)</option>
                  <option value="Caveat, cursive">Caveat (Signature)</option>
                  <option value="Georgia, serif">Georgia (Editorial)</option>
                  <option value="monospace">Courier (Mono)</option>
                </select>

                {/* Font Size Selector */}
                <select
                  value={current.fontSize}
                  onMouseDown={saveSelection}
                  onChange={(e) => changeFontSize(e.target.value)}
                  className="bg-white text-slate-800 text-[11px] sm:text-xs border border-slate-300 rounded px-2 py-1 sm:px-2.5 sm:py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  title="Font Size"
                >
                  <option value="20px">20px</option>
                  <option value="24px">24px</option>
                  <option value="28px">28px</option>
                  <option value="32px">32px</option>
                  <option value="36px">36px</option>
                </select>

                <span className="h-4 w-px bg-slate-300 mx-0.5 hidden xs:inline-block sm:inline-block" />

                {/* Bold */}
                <button
                  type="button"
                  onMouseDown={preventFocusLoss}
                  onClick={toggleBold}
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded text-[11px] sm:text-xs font-bold transition-colors flex items-center justify-center ${
                    current.bold
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-700 hover:bg-slate-200/80'
                  }`}
                  title="Bold"
                >
                  B
                </button>

                {/* Italic */}
                <button
                  type="button"
                  onMouseDown={preventFocusLoss}
                  onClick={toggleItalic}
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded text-[11px] sm:text-xs italic font-serif transition-colors flex items-center justify-center ${
                    current.italic
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-700 hover:bg-slate-200/80'
                  }`}
                  title="Italic"
                >
                  I
                </button>

                {/* Underline */}
                <button
                  type="button"
                  onMouseDown={preventFocusLoss}
                  onClick={toggleUnderline}
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded text-[11px] sm:text-xs underline font-semibold transition-colors flex items-center justify-center ${
                    current.underline
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-700 hover:bg-slate-200/80'
                  }`}
                  title="Underline"
                >
                  U
                </button>

                <span className="h-4 w-px bg-slate-300 mx-0.5 hidden xs:inline-block sm:inline-block" />

                {/* Text Color Picker */}
                <div className="flex items-center gap-1.5" title="Heading Text Color">
                  <input
                    type="color"
                    value={current.color}
                    onMouseDown={saveSelection}
                    onChange={(e) => changeColor(e.target.value)}
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded cursor-pointer border border-slate-300 bg-transparent p-0.5"
                  />
                </div>

                <span className="h-4 w-px bg-slate-300 mx-0.5 hidden xs:inline-block sm:inline-block" />

                {/* Text Alignments */}
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onMouseDown={preventFocusLoss}
                    onClick={() => changeAlign('left')}
                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded text-[11px] sm:text-xs transition-colors flex items-center justify-center ${
                      current.align === 'left'
                        ? 'bg-indigo-100 text-indigo-700 font-bold'
                        : 'text-slate-700 hover:bg-slate-200/80'
                    }`}
                    title="Align Left"
                  >
                    ⇤
                  </button>
                  <button
                    type="button"
                    onMouseDown={preventFocusLoss}
                    onClick={() => changeAlign('center')}
                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded text-[11px] sm:text-xs transition-colors flex items-center justify-center ${
                      current.align === 'center'
                        ? 'bg-indigo-100 text-indigo-700 font-bold'
                        : 'text-slate-700 hover:bg-slate-200/80'
                    }`}
                    title="Align Center"
                  >
                    ↔
                  </button>
                  <button
                    type="button"
                    onMouseDown={preventFocusLoss}
                    onClick={() => changeAlign('right')}
                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded text-[11px] sm:text-xs transition-colors flex items-center justify-center ${
                      current.align === 'right'
                        ? 'bg-indigo-100 text-indigo-700 font-bold'
                        : 'text-slate-700 hover:bg-slate-200/80'
                    }`}
                    title="Align Right"
                  >
                    ⇥
                  </button>
                </div>

                <span className="h-4 w-px bg-slate-300 mx-0.5 hidden xs:inline-block sm:inline-block" />

                {/* Undo / Redo */}
                <div className="flex items-center gap-0.5 ml-auto">
                  <button
                    type="button"
                    onMouseDown={preventFocusLoss}
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="w-6 h-6 sm:w-7 sm:h-7 rounded text-[11px] sm:text-xs text-slate-700 hover:bg-slate-200/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center font-bold"
                    title="Undo"
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    onMouseDown={preventFocusLoss}
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className="w-6 h-6 sm:w-7 sm:h-7 rounded text-[11px] sm:text-xs text-slate-700 hover:bg-slate-200/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center font-bold"
                    title="Redo"
                  >
                    ↷
                  </button>
                </div>
              </div>

              {/* Document Sheet Body — Authentic Professional Service Agreement */}
              <div className="p-4 sm:p-7 md:p-8 lg:p-12 space-y-4 sm:space-y-5 lg:space-y-6 bg-white min-h-0 sm:min-h-[520px] lg:min-h-[580px]">
                {/* Document Metadata Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 text-xs text-slate-500 border-b border-slate-200 pb-3 sm:pb-4">
                  <div>
                    <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">Document Ref</span>
                    <span className="font-semibold text-slate-800 text-[11px] sm:text-xs">AGY-2026-MSA-084</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">Effective Date</span>
                    <span className="font-semibold text-slate-800 text-[11px] sm:text-xs">October 08, 2026</span>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">Agreement Status</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[10px] sm:text-[11px]">
                      ● Active Master Draft
                    </span>
                  </div>
                </div>

                {/* Parties Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs bg-slate-50/70 p-3 sm:p-3.5 rounded-xl border border-slate-200/80">
                  <div>
                    <span className="block font-bold text-slate-900 mb-0.5 text-[11px] sm:text-xs">SERVICE PROVIDER:</span>
                    <p className="text-slate-600 text-xs break-words">Antigravity Document Systems Ltd.</p>
                    <p className="text-slate-500 text-[10px] sm:text-[11px] break-words">Enterprise Cloud Operations Division</p>
                  </div>
                  <div>
                    <span className="block font-bold text-slate-900 mb-0.5 text-[11px] sm:text-xs">CLIENT ENTITY:</span>
                    <p className="text-slate-600 text-xs break-words">Acme Global Technologies Inc.</p>
                    <p className="text-slate-500 text-[10px] sm:text-[11px] break-words">Corporate Workspace Solutions</p>
                  </div>
                </div>

                {/* ONLY THIS HEADING IS EDITABLE */}
                <div className="relative group/heading pt-1 sm:pt-2 pb-1">
                  <div
                    ref={(el) => {
                      headingRef.current = el;
                      if (el && !el.textContent) {
                        el.textContent = INITIAL_HEADING_STATE.text;
                      }
                    }}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={handleHeadingInput}
                    onBlur={handleHeadingBlur}
                    onSelect={saveSelection}
                    onKeyUp={saveSelection}
                    onMouseUp={saveSelection}
                    style={{
                      fontFamily: current.fontFamily,
                      fontSize: `clamp(1.25rem, 4vw, ${current.fontSize})`,
                      fontWeight: current.bold ? '700' : '400',
                      fontStyle: current.italic ? 'italic' : 'normal',
                      textDecoration: current.underline ? 'underline' : 'none',
                      color: current.color,
                      textAlign: current.align,
                    }}
                    className="outline-none focus:ring-2 focus:ring-indigo-500/30 rounded px-1.5 py-0.5 transition-all tracking-tight leading-snug cursor-text break-words max-w-full"
                  />
                  <span className="absolute -top-3 right-0 text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded opacity-0 group-hover/heading:opacity-100 transition-opacity pointer-events-none">
                    Editable Title
                  </span>
                </div>

                {/* READ-ONLY FIXED DOCUMENT BODY (Not contenteditable, completely read-only) */}
                <div className="space-y-3.5 sm:space-y-4 lg:space-y-5 text-slate-600 text-xs sm:text-sm leading-normal sm:leading-relaxed select-text border-t border-slate-100 pt-2.5 sm:pt-3">
                  <div>
                    <h4 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">
                      INTRODUCTION &amp; RECITALS
                    </h4>
                    <p className="break-words">
                      This Master Service Agreement (the “Agreement”) establishes the contractual framework, operational protocols, and delivery commitments governing the provision of secure workspace intelligence tools provided by Antigravity Document Systems Ltd. to the Client.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">
                      1. SCOPE OF SERVICES &amp; WORKSPACE CAPABILITIES
                    </h4>
                    <p className="break-words">
                      The Provider shall supply real-time inline document editing, universal file format conversion, AI semantic document analysis, legally binding e-signatures, and multi-page arrangement features in accordance with standard enterprise specifications.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">
                      2. OPERATIONAL RESPONSIBILITIES &amp; SERVICE LEVELS
                    </h4>
                    <p className="break-words">
                      The Provider guarantees a minimum system uptime of 99.98% per calendar month, supported by 24/7 technical incident coverage. The Client agrees to designate authorized administrative representatives and maintain organizational access integrity.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">
                      3. TERM &amp; PERPETUAL CONFIDENTIALITY
                    </h4>
                    <p className="break-words">
                      This Agreement remains operative for an initial term of twenty-four (24) months. Both parties agree that proprietary data, uploaded files, extracted summaries, and cryptographic keys remain strictly confidential under mutual non-disclosure obligations.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">
                      4. FEES, INVOICING &amp; REMITTANCE
                    </h4>
                    <p className="break-words">
                      Subscription service fees are billed in accordance with the enterprise tier specified in Schedule B. All electronic invoices are due and payable net-thirty (30) days from statement transmission.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-900 mb-1">
                      5. GENERAL PROVISIONS &amp; GOVERNING LAW
                    </h4>
                    <p className="break-words">
                      This instrument constitutes the entire mutual understanding between the signatories and supersedes prior discussions. Any modification must be executed in writing and verified through certified digital audit seals.
                    </p>
                  </div>

                  {/* APPROVAL & SIGNATURES AREA */}
                  <div className="pt-4 sm:pt-6 border-t border-slate-200">
                    <h4 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-900 mb-2.5 sm:mb-4">
                      APPROVAL &amp; AUTHORIZED SIGNATURES
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
                      <div className="bg-slate-50/70 p-3 sm:p-3.5 rounded-xl border border-slate-200">
                        <span className="block text-[11px] font-bold text-slate-800">CLIENT REPRESENTATIVE</span>
                        <p className="text-slate-600 text-xs mt-0.5">Alex Vance · VP Operations</p>
                        <div className="my-1.5 sm:my-2 border-b border-dashed border-slate-300" />
                        <span className="font-signature text-lg sm:text-xl text-rose-600 block">Alex Vance</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5 sm:mt-1">Certified Oct 08, 2026 · ESIGN Verified</span>
                      </div>

                      <div className="bg-slate-50/70 p-3 sm:p-3.5 rounded-xl border border-slate-200">
                        <span className="block text-[11px] font-bold text-slate-800">PROVIDER REPRESENTATIVE</span>
                        <p className="text-slate-600 text-xs mt-0.5">Marcus Chen · Managing Director</p>
                        <div className="my-1.5 sm:my-2 border-b border-dashed border-slate-300" />
                        <span className="font-signature text-lg sm:text-xl text-indigo-700 block">Marcus Chen</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5 sm:mt-1">Certified Oct 08, 2026 · Cryptographic SHA-256</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}