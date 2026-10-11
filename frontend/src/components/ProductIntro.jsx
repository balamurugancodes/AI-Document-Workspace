import { useEffect, useRef, useState } from "react";

export default function ProductIntro() {
  const sectionRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // Respect user's motion preference
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      setReducedMotion(true);
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
      { threshold: 0.15 }
    );

    const currentEl = sectionRef.current;
    if (currentEl) {
      observer.observe(currentEl);
    }

    return () => {
      if (currentEl) observer.unobserve(currentEl);
      observer.disconnect();
    };
  }, []);

  const revealStyle = reducedMotion
    ? undefined
    : {
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(20px)",
        transition:
          "opacity 0.75s cubic-bezier(0.16, 1, 0.3, 1), transform 0.75s cubic-bezier(0.16, 1, 0.3, 1)",
      };

  return (
    <section
      ref={sectionRef}
      aria-label="Brand Statement"
      className="relative w-full bg-white border-t border-slate-100 py-20 sm:py-28 lg:py-36 overflow-hidden"
    >
      <div
        className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
        style={revealStyle}
      >
        {/* Subtle accent emblem with brand indigo & rose tokens */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary-indigo,#4f46e5)]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-rose,#e11d48)]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary-blue,#2563eb)]" />
        </div>

        {/* Main Statement — rendered in Caveat via .font-signature */}
        <blockquote className="font-signature text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-slate-800 leading-snug sm:leading-tight tracking-wide mb-6">
          “Documents should work around you — not the other way around.”
        </blockquote>

        {/* Supporting Text — rendered in Manrope */}
        <p className="mx-auto text-sm sm:text-base md:text-lg text-slate-500 font-normal leading-relaxed max-w-xl">
          Edit, organize, convert, sign, and understand your documents from one
          focused workspace.
        </p>
      </div>
    </section>
  );
}