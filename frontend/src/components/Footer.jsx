import React from 'react';

export default function Footer() {
  return (
    <footer
      aria-label="Site Footer"
      className="w-full bg-white border-t border-slate-200/80 text-slate-600"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 lg:pt-20 pb-8 sm:pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-12 gap-8 sm:gap-10 lg:gap-12">
          {/* ========================================================
              1. BRAND AREA
              ======================================================== */}
          <div className="sm:col-span-2 md:col-span-4 lg:col-span-5 flex flex-col items-start">
            <a
              href="#"
              className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs flex-shrink-0">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
              </div>
              <span className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                AD Workspace
              </span>
            </a>

            <p className="mt-3.5 text-xs sm:text-sm text-slate-500 leading-relaxed max-w-sm">
              Your all-in-one workspace to manage, edit, convert, and understand documents with AI.
            </p>
          </div>

          {/* ========================================================
              2. QUICK NAVIGATION
              ======================================================== */}
          <div className="lg:col-span-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3.5 sm:mb-4">
              Quick Navigation
            </h3>
            <ul className="space-y-2.5 sm:space-y-3 text-xs sm:text-sm">
              <li>
                <a
                  href="#"
                  className="inline-block text-slate-600 hover:text-blue-600 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  Home
                </a>
              </li>
              <li>
                <a
                  href="#features"
                  className="inline-block text-slate-600 hover:text-blue-600 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#how-it-works"
                  className="inline-block text-slate-600 hover:text-blue-600 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  How It Works
                </a>
              </li>
              <li>
                <a
                  href="#pricing"
                  className="inline-block text-slate-600 hover:text-blue-600 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  Pricing
                </a>
              </li>
            </ul>
          </div>

          {/* ========================================================
              3. DOCUMENT TOOLS
              ======================================================== */}
          <div className="lg:col-span-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3.5 sm:mb-4">
              Document Tools
            </h3>
            <ul className="space-y-2.5 sm:space-y-3 text-xs sm:text-sm">
              <li>
                <a
                  href="#features"
                  className="inline-block text-slate-600 hover:text-blue-600 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  PDF Editor
                </a>
              </li>
              <li>
                <a
                  href="#features"
                  className="inline-block text-slate-600 hover:text-blue-600 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  Merge PDF
                </a>
              </li>
              <li>
                <a
                  href="#features"
                  className="inline-block text-slate-600 hover:text-blue-600 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  Split PDF
                </a>
              </li>
              <li>
                <a
                  href="#features"
                  className="inline-block text-slate-600 hover:text-blue-600 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  Compress PDF
                </a>
              </li>
              <li>
                <a
                  href="#features"
                  className="inline-block text-slate-600 hover:text-blue-600 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  Convert PDF
                </a>
              </li>
              <li>
                <a
                  href="#ai-analysis"
                  className="inline-block text-slate-600 hover:text-blue-600 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  AI Document Analysis
                </a>
              </li>
            </ul>
          </div>

          {/* ========================================================
              4. ACCOUNT LINKS
              ======================================================== */}
          <div className="lg:col-span-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3.5 sm:mb-4">
              Account
            </h3>
            <ul className="space-y-2.5 sm:space-y-3 text-xs sm:text-sm">
              <li>
                <a
                  href="/login"
                  className="inline-block text-slate-600 hover:text-blue-600 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  Login
                </a>
              </li>
              <li>
                <a
                  href="/signup"
                  className="inline-block text-slate-600 hover:text-blue-600 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  Sign Up
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* ========================================================
            5. BOTTOM COPYRIGHT BAR
            ======================================================== */}
        <div className="mt-10 sm:mt-12 lg:mt-16 pt-6 sm:pt-8 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <p className="text-xs sm:text-sm text-slate-500 leading-normal">
            © 2026 AD Workspace &amp; Bala. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}