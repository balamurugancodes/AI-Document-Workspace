import { useEffect, useRef, useState } from "react";

const steps = [
  { id: "edit", label: "Edit", step: "01", summary: "Refine content & layout" },
  { id: "convert", label: "Convert", step: "02", summary: "Switch any file format" },
  { id: "analyze", label: "Analyze", step: "03", summary: "Extract AI intelligence" },
  { id: "sign", label: "Sign", step: "04", summary: "Certify & legal e-sign" },
  { id: "organize", label: "Organize", step: "05", summary: "Catalog & manage files" },
];

export default function WorkflowHighlight() {
  const sectionRef = useRef(null);
  const chainRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    // Check reduced motion preference
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      setIsReducedMotion(true);
      return;
    }

    let rafId = null;

    const handleScroll = () => {
      const el = chainRef.current || sectionRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // Calculate progress across the workflow chain as it enters the viewport
      const start = windowHeight * 0.75;
      const end = windowHeight * 0.25;
      const totalDistance = start - end;
      const currentPos = start - rect.top;

      if (currentPos < 0) {
        setActiveIndex(-1);
      } else {
        const progress = Math.min(1, currentPos / totalDistance);
        const newIndex = Math.min(
          steps.length - 1,
          Math.floor(progress * steps.length)
        );
        setActiveIndex(newIndex);
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(handleScroll);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-label="Workflow Journey"
      className="relative w-full bg-white border-t border-slate-100 py-14 sm:py-24 lg:py-32 xl:py-40 overflow-hidden"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Eyebrow */}
        <p
          className="inline-block text-[11px] sm:text-xs font-bold uppercase mb-3 sm:mb-4 tracking-widest"
          style={{ color: "#4f46e5", letterSpacing: "0.14em" }}
        >
          THE COMPLETE WORKFLOW
        </p>

        {/* Main Heading */}
        <h2
          className="font-extrabold tracking-tight text-slate-900 mb-6 sm:mb-10 lg:mb-12 break-words"
          style={{
            fontSize: "clamp(1.75rem, 4.5vw, 3.5rem)",
            lineHeight: "1.15",
            letterSpacing: "-0.035em",
          }}
        >
          From your first upload to the{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            final document.
          </span>
        </h2>

        {/* ── Typographic Workflow Chain ────────────────────────────────────── */}
        <div
          ref={chainRef}
          role="list"
          aria-label="Document workflow steps"
          className="my-8 sm:my-12 lg:my-16 flex flex-wrap items-center justify-center gap-y-5 sm:gap-y-6 gap-x-1 sm:gap-x-3 md:gap-x-4 max-w-5xl mx-auto"
        >
          {steps.map((item, index) => {
            const isActive = isReducedMotion || activeIndex === index;

            return (
              <div
                key={item.id}
                role="listitem"
                className="inline-flex items-center"
              >
                {/* Step Item */}
                <div
                  className={[
                    "flex flex-col items-center transition-all duration-300 px-2 sm:px-3 py-1.5 sm:py-2 rounded-2xl min-w-0",
                    isActive
                      ? "scale-100"
                      : "opacity-40 hover:opacity-70",
                  ].join(" ")}
                >
                  {/* Step number badge */}
                  <span
                    className={[
                      "text-[10px] sm:text-xs font-bold tracking-widest uppercase mb-1 sm:mb-1.5 transition-colors duration-300",
                      isActive ? "text-blue-600" : "text-slate-400",
                    ].join(" ")}
                  >
                    {item.step}
                  </span>

                  {/* Word */}
                  <span
                    className={[
                      "font-black tracking-tight text-2xl xs:text-3xl sm:text-4xl md:text-5xl lg:text-6xl transition-all duration-300 break-words",
                      isActive
                        ? "text-slate-900"
                        : "text-slate-300",
                    ].join(" ")}
                    style={
                      isActive
                        ? {
                            background:
                              "linear-gradient(135deg, #1e293b 0%, #2563eb 100%)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                          }
                        : undefined
                    }
                  >
                    {item.label}
                  </span>

                  {/* Micro label */}
                  <span
                    className={[
                      "text-[10px] sm:text-xs font-medium mt-1.5 sm:mt-2 transition-colors duration-300 text-center max-w-[125px] sm:max-w-none whitespace-normal sm:whitespace-nowrap break-words",
                      isActive ? "text-slate-600" : "text-transparent",
                    ].join(" ")}
                  >
                    {item.summary}
                  </span>
                </div>

                {/* Arrow Divider (except after the last item) */}
                {index < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="text-slate-300 text-base sm:text-2xl lg:text-3xl font-light mx-0.5 sm:mx-1.5 lg:mx-3 select-none flex-shrink-0"
                  >
                    →
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Supporting Paragraph */}
        <p
          className="mx-auto text-slate-500 font-normal leading-relaxed text-xs sm:text-base md:text-lg max-w-2xl px-2 sm:px-0 break-words"
          style={{ lineHeight: "1.75" }}
        >
          AI Document Workspace unites every step of your file workflow in a single
          fluid environment. Instead of context-switching across separate single-purpose
          utilities, every action naturally leads to the next — accelerating productivity
          and keeping all your paperwork securely in sync.
        </p>
      </div>
    </section>
  );
}