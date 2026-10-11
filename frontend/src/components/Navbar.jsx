import { useState, useEffect, useRef } from "react";

// ── Product Features for Mega Menu ───────────────────────────────────────────
const PRODUCT_STUDIO_FEATURES = [
  {
    title: "Edit PDF",
    desc: "Edit text, images, and layout directly inside PDF",
    href: "/tools#edit",
    badge: null,
    icon: (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ),
  },
  {
    title: "Convert PDF",
    desc: "Convert between PDF, Word, Excel, PowerPoint & JPG",
    href: "/tools#convert",
    badge: null,
    icon: (
      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    title: "Sign PDF",
    desc: "Legally binding electronic signatures & audit trail",
    href: "/tools#sign",
    badge: null,
    icon: (
      <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ),
  },
  {
    title: "Organize Documents",
    desc: "Merge, split, reorder, rotate & extract pages",
    href: "/tools#organize",
    badge: null,
    icon: (
      <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
];

const PRODUCT_AI_FEATURES = [
  {
    title: "AI Document Analysis",
    desc: "Summarize agreements, extract terms, and find key topics",
    href: "/ai-analyzer",
    badge: "Popular",
    icon: (
      <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
  },
  {
    title: "Chat with Document",
    desc: "Ask questions, clarify clauses & verify facts instantly",
    href: "/ai-analyzer#chat",
    badge: "AI",
    icon: (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.974-.94 4.52 4.52 0 00.74-2.28C3.805 16.32 3 14.28 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
  },
];

const standardNavLinks = [
  { label: "Tools", href: "/tools" },
  { label: "AI Analyzer", href: "/ai-analyzer" },
  { label: "My Documents", href: "/documents" },
];

function BrandIcon() {
  return (
    <div
      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{
        background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
        boxShadow: "0 2px 8px rgba(37,99,235,0.25)",
      }}
    >
      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
  );
}

function HamburgerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default function Navbar({ onLoginClick, onSignupClick }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [mobileProductExpanded, setMobileProductExpanded] = useState(false);

  // navState: "at-top" (visible, transparent), "hero-scrolling" (hidden), "past-hero" (visible, white)
  const [navState, setNavState] = useState("at-top");
  const navStateRef = useRef(navState);
  navStateRef.current = navState;

  const productContainerRef = useRef(null);
  const closeTimeoutRef = useRef(null);

  // ── Scroll Listener for Hero-section Boundary Detection ─────────────────────
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollY = window.scrollY || window.pageYOffset;
          const heroEl = document.getElementById("hero");

          let pastHero = false;
          if (heroEl) {
            const rect = heroEl.getBoundingClientRect();
            // Hero section has passed when its bottom is at or above top of viewport
            // Hysteresis buffer prevents boundary flicker
            const wasPastHero = navStateRef.current === "past-hero";
            pastHero = wasPastHero ? rect.bottom <= 20 : rect.bottom <= 0;
          } else {
            pastHero = scrollY > 750;
          }

          if (scrollY <= 25) {
            setNavState("at-top");
          } else if (pastHero) {
            setNavState("past-hero");
          } else {
            setNavState("hero-scrolling");
            setProductOpen(false); // safely close dropdown while navbar hides
          }

          ticking = false;
        });
        ticking = true;
      }
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ── Cleanup Dropdown Timeout on Unmount ─────────────────────────────────────
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // ── Desktop Hover Stability (Debounce Grace Period) ─────────────────────────
  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setProductOpen(true);
  };

  const handleMouseLeave = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = setTimeout(() => {
      setProductOpen(false);
    }, 180);
  };

  // ── Keyboard & Click-Outside Handlers ───────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && productOpen) {
        setProductOpen(false);
      }
    };

    const handleClickOutside = (e) => {
      if (
        productContainerRef.current &&
        !productContainerRef.current.contains(e.target)
      ) {
        setProductOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [productOpen]);

  const toggleMobileMenu = () => setMenuOpen((prev) => !prev);
  const closeMobileMenu = () => {
    setMenuOpen(false);
    setMobileProductExpanded(false);
  };

  // ── Determine Navbar Visual Styling ─────────────────────────────────────────
  // A. At top: visible, transparent
  // B. While scrolling within Hero: hidden completely (translateY(-100%), opacity 0)
  // C. Past Hero: visible, solid white, border & shadow
  // Mobile drawer open: always visible and solid white
  const isVisible = navState === "at-top" || navState === "past-hero" || menuOpen;
  const isSolid = (navState === "past-hero" || menuOpen) && navState !== "at-top";

  const navContainerStyle = {
    transform: isVisible ? "translateY(0)" : "translateY(-100%)",
    opacity: isVisible ? 1 : 0,
    pointerEvents: isVisible ? "auto" : "none",
    backgroundColor: isSolid ? "#ffffff" : "transparent",
    borderBottom: isSolid ? "1px solid #e2e8f0" : "1px solid transparent",
    boxShadow: isSolid ? "0 1px 4px rgba(0, 0, 0, 0.05)" : "none",
    transition:
      "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease, background-color 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease",
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50" style={navContainerStyle}>
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-15 sm:h-16 gap-2">

          {/* ── Brand Logo ─────────────────────────────────────────────────── */}
          <a href="/" className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0 min-w-0">
            <BrandIcon />
            <span className="font-semibold text-xs sm:text-sm md:text-base tracking-tight text-slate-800 truncate">
              AI Document Workspace
            </span>
          </a>

          {/* ── Desktop Nav Links ──────────────────────────────────────────── */}
          <nav className="hidden md:flex items-center gap-0.5 lg:gap-1 text-xs lg:text-sm font-medium">
            <a
              href="/"
              className="px-2 lg:px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 transition-all duration-200"
            >
              Home
            </a>

            {/* ── Product Dropdown Trigger + Floating Mega Menu ────────────── */}
            <div
              ref={productContainerRef}
              className="relative"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <button
                type="button"
                onClick={() => setProductOpen((prev) => !prev)}
                aria-expanded={productOpen}
                aria-haspopup="true"
                className={`flex items-center gap-1.5 px-2 lg:px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-all duration-200 cursor-pointer ${
                  productOpen
                    ? "text-blue-600 bg-blue-50/80"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                }`}
              >
                <span>Product</span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    productOpen ? "rotate-180 text-blue-600" : "text-slate-400"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {/* ── Floating Mega Menu Panel ───────────────────────────────── */}
              <div
                className="absolute left-0 md:-left-16 lg:left-0 mt-2 w-[540px] max-w-[calc(100vw-3rem)] rounded-2xl bg-white border border-slate-200/90 p-3.5 sm:p-4 origin-top"
                style={{
                  opacity: productOpen ? 1 : 0,
                  transform: productOpen ? "translateY(0)" : "translateY(-8px)",
                  pointerEvents: productOpen ? "auto" : "none",
                  visibility: productOpen ? "visible" : "hidden",
                  transition: "opacity 220ms ease, transform 220ms ease, visibility 220ms ease",
                  boxShadow:
                    "0 16px 48px -4px rgba(15,23,42,0.12), 0 4px 16px rgba(15,23,42,0.04)",
                }}
                role="menu"
                aria-orientation="vertical"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  {/* Left Column: Document Studio */}
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block px-2.5 pb-2">
                      Document Studio
                    </span>
                    <div className="space-y-1">
                      {PRODUCT_STUDIO_FEATURES.map((item) => (
                        <a
                          key={item.title}
                          href={item.href}
                          onClick={() => setProductOpen(false)}
                          className="flex items-start gap-2.5 sm:gap-3 p-2 sm:p-2.5 rounded-xl hover:bg-slate-50 transition-colors group"
                        >
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                            {item.icon}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-slate-800 block group-hover:text-blue-600 transition-colors truncate">
                              {item.title}
                            </span>
                            <span className="text-[11px] text-slate-500 line-clamp-1">
                              {item.desc}
                            </span>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>

                  {/* Right Column: AI Intelligence */}
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block px-2.5 pb-2">
                      AI Intelligence
                    </span>
                    <div className="space-y-1">
                      {PRODUCT_AI_FEATURES.map((item) => (
                        <a
                          key={item.title}
                          href={item.href}
                          onClick={() => setProductOpen(false)}
                          className="flex items-start gap-2.5 sm:gap-3 p-2 sm:p-2.5 rounded-xl hover:bg-slate-50 transition-colors group"
                        >
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-purple-50 group-hover:text-purple-600 transition-colors">
                            {item.icon}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-slate-800 block group-hover:text-purple-600 transition-colors truncate">
                                {item.title}
                              </span>
                              {item.badge && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex-shrink-0">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 line-clamp-1">
                              {item.desc}
                            </span>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Dropdown Footer */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between px-2">
                  <span className="text-[11px] text-slate-400 truncate pr-2">
                    All tools in one unified workspace
                  </span>
                  <a
                    href="/tools"
                    onClick={() => setProductOpen(false)}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 whitespace-nowrap flex-shrink-0"
                  >
                    <span>View all tools</span>
                    <span>→</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Other standard nav items */}
            {standardNavLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="px-2 lg:px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 transition-all duration-200 whitespace-nowrap"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* ── Desktop Auth Buttons ───────────────────────────────────────── */}
          <div className="hidden md:flex items-center gap-1.5 lg:gap-2 flex-shrink-0">
            <a
              href="/login"
              onClick={(e) => {
                if (onLoginClick) {
                  e.preventDefault();
                  onLoginClick(e);
                }
              }}
              className="text-xs lg:text-sm font-medium px-2.5 lg:px-3.5 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 transition-all duration-200 cursor-pointer"
            >
              Login
            </a>
            <a
              href="/signup"
              onClick={(e) => {
                if (onSignupClick) {
                  e.preventDefault();
                  onSignupClick(e);
                }
              }}
              className="text-xs lg:text-sm font-semibold px-3 lg:px-4 py-1.5 sm:py-2 rounded-lg text-white transition-all duration-200 hover:opacity-90 hover:-translate-y-px whitespace-nowrap cursor-pointer"
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
                boxShadow: "0 2px 8px rgba(37,99,235,0.28)",
              }}
            >
              Get Started
            </a>
          </div>

          {/* ── Mobile Hamburger Button ────────────────────────────────────── */}
          <button
            onClick={toggleMobileMenu}
            className="md:hidden p-2 -mr-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <CloseIcon /> : <HamburgerIcon />}
          </button>
        </div>
      </div>

      {/* ── Mobile Drawer ──────────────────────────────────────────────────── */}
      {menuOpen && (
        <div
          className="md:hidden px-3.5 sm:px-4 py-3 space-y-1 bg-white border-t border-slate-200 shadow-lg max-h-[calc(100vh-4rem)] overflow-y-auto overscroll-contain"
        >
          <a
            href="/"
            onClick={closeMobileMenu}
            className="block py-2.5 px-3 text-sm font-medium rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-all duration-200"
          >
            Home
          </a>

          {/* Mobile Product Accordion */}
          <div>
            <button
              type="button"
              onClick={() => setMobileProductExpanded((prev) => !prev)}
              className="w-full flex items-center justify-between py-2.5 px-3 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-50 transition-all duration-200"
            >
              <span>Product</span>
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                  mobileProductExpanded ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {mobileProductExpanded && (
              <div className="pl-3 sm:pl-4 pr-2 py-2 space-y-1 bg-slate-50/70 rounded-xl my-1 border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-2 pt-1 pb-1">
                  Document Tools
                </span>
                {PRODUCT_STUDIO_FEATURES.map((item) => (
                  <a
                    key={item.title}
                    href={item.href}
                    onClick={closeMobileMenu}
                    className="flex items-center gap-2.5 py-2 px-2 text-xs font-medium text-slate-600 hover:text-blue-600 rounded-lg hover:bg-white min-w-0"
                  >
                    {item.icon}
                    <span className="truncate">{item.title}</span>
                  </a>
                ))}

                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-2 pt-3 pb-1">
                  AI Capabilities
                </span>
                {PRODUCT_AI_FEATURES.map((item) => (
                  <a
                    key={item.title}
                    href={item.href}
                    onClick={closeMobileMenu}
                    className="flex items-center gap-2.5 py-2 px-2 text-xs font-medium text-slate-600 hover:text-purple-600 rounded-lg hover:bg-white min-w-0"
                  >
                    {item.icon}
                    <span className="truncate">{item.title}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Remaining Standard Links */}
          {standardNavLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={closeMobileMenu}
              className="block py-2.5 px-3 text-sm font-medium rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-all duration-200"
            >
              {link.label}
            </a>
          ))}

          {/* Mobile Auth Actions */}
          <div className="pt-3 pb-1 flex flex-col gap-2 border-t border-slate-200 mt-2">
            <a
              href="/login"
              onClick={(e) => {
                closeMobileMenu();
                if (onLoginClick) {
                  e.preventDefault();
                  onLoginClick(e);
                }
              }}
              className="block py-2.5 px-3 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-50 text-center cursor-pointer"
            >
              Login
            </a>
            <a
              href="/signup"
              onClick={(e) => {
                closeMobileMenu();
                if (onSignupClick) {
                  e.preventDefault();
                  onSignupClick(e);
                }
              }}
              className="block py-2.5 px-3 text-sm font-semibold text-center rounded-lg text-white cursor-pointer"
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
                boxShadow: "0 2px 8px rgba(37,99,235,0.25)",
              }}
            >
              Get Started
            </a>
          </div>
        </div>
      )}
    </header>
  );
}