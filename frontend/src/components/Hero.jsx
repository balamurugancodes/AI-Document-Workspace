import { useEffect, useState } from "react";

export default function Hero() {
  const [mounted, setMounted] = useState(false);

  // One-time entry animation for hero text/CTAs
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const entryStyle = {
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(18px)",
    transition: "opacity 0.65s ease, transform 0.65s ease",
  };

  return (
    <>
      <section
        id="hero"
        aria-label="Hero"
        className="relative w-full overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, #C7F2E5 0%, #D8ECFF 15%, #F0F7FF 36%, #FFFFFF 100%)",
        }}
      >
        {/* Subtle background radial depth */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "-80px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "900px",
            height: "500px",
            background:
              "radial-gradient(ellipse at center, rgba(99,102,241,0.07) 0%, transparent 80%)",
            pointerEvents: "none",
          }}
        />

        {/* ── Text + CTAs ───────────────────────────────────────────────────── */}
        <div
          className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 lg:pt-24 text-center"
          style={entryStyle}
        >
          {/* Eyebrow */}
          <p
            className="inline-block text-xs font-bold uppercase mb-4 sm:mb-5 tracking-wider"
            style={{ color: "#000000", letterSpacing: "0.1em" }}
          >
            AI Document Workspace
          </p>

          {/* Headline */}
          <h1
            className="font-extrabold tracking-tight text-slate-900 mb-4 sm:mb-5 break-words"
            style={{
              fontSize: "clamp(1.875rem, 5.5vw, 3.5rem)",
              lineHeight: "1.12",
              letterSpacing: "-0.035em",
            }}
          >
            One workspace for{" "}
            
              every document.
          </h1>

          {/* Supporting text */}
          <p
            className="mx-auto text-slate-500 mb-8 sm:mb-9 lg:mb-10 px-2 sm:px-0 break-words"
            style={{
              fontSize: "clamp(0.9375rem, 2vw, 1.175rem)",
              lineHeight: "1.7",
              maxWidth: "520px",
            }}
          >
            Edit, convert, organize, sign, and understand your documents —
            all in one intelligent workspace.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12 sm:mb-16 w-full max-w-xs sm:max-w-none mx-auto">
            {/* Primary */}
            <a
              href="/signup"
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 text-sm font-semibold text-white rounded-xl px-6 py-3 transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 select-none text-center"
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
                boxShadow:
                  "0 4px 14px rgba(37,99,235,0.35), 0 1px 3px rgba(37,99,235,0.2)",
              }}
            >
              <span>Get Started</span>
              <svg
                className="w-4 h-4 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>

            {/* Secondary */}
            <a
              href="#tools"
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 text-sm font-semibold rounded-xl px-6 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 select-none text-center"
              style={{
                color: "#475569",
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}
            >
              <span>Explore Tools</span>
            </a>
          </div>
        </div>

        {/* ── Product demo video ─────────────────────────────────────────────── */}
        <div
          className="relative w-full max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8"
          style={entryStyle}
        >
          {/* Shadow wrapper */}
          <div
            className="w-full rounded-2xl"
            style={{
              borderRadius: "16px",
              boxShadow:
                "0 20px 60px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)",
            }}
          >
            {/* Video container */}
            <div
              className="w-full overflow-hidden"
              style={{
                borderRadius: "16px",
                border: "1px solid #e2e8f0",
                overflow: "hidden",
                background: "#f8fafc",
              }}
            >
              <video
                src="/videos/hero-demo.mp4"
                autoPlay
                muted
                loop
                playsInline
                aria-label="AI Document Workspace product demo"
                style={{
                  display: "block",
                  width: "100%",
                  height: "auto",
                  maxHeight: "75vh",
                  objectFit: "contain",
                }}
              />
            </div>
          </div>

          {/* Caption */}
          <p
            className="mt-3 sm:mt-4 text-xs text-slate-400 text-center px-4 break-words"
            style={{ letterSpacing: "0.01em" }}
          >
            See how AI Document Workspace brings your documents into one place.
          </p>
        </div>

        {/* Bottom spacing */}
        <div className="pb-12 sm:pb-16 lg:pb-20" />
      </section>

      {/* ── Global Bottom-Center "Upload Documents" Button ─────────────────── */}
      <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-auto max-w-[calc(100vw-2rem)]">
        <button
          type="button"
          aria-label="Upload Documents"
          className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold text-white tracking-tight whitespace-nowrap cursor-pointer transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 select-none shadow-lg"
          style={{
            background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
            boxShadow:
              "0 8px 24px rgba(37,99,235,0.38), 0 2px 6px rgba(0,0,0,0.08)",
            border: "1px solid rgba(255,255,255,0.2)",
          }}
        >
          {/* Small upload/document icon */}
          <svg
            className="w-4 h-4 text-white flex-shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 16.5V4.5m0 0L7.5 9m4.5-4.5l4.5 4.5M4.5 19.5h15"
            />
          </svg>
          <span>Upload Documents</span>
        </button>
      </div>
    </>
  );
}