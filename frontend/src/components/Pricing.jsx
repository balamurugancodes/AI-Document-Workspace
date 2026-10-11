import React, { useState } from 'react';

// ── Simple Checkmark Icon ────────────────────────────────────────────────────
function CheckIcon({ className = 'w-4 h-4 text-blue-600 flex-shrink-0' }) {
  return (
    <svg
      className={className}
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

// ── Plan Definitions ─────────────────────────────────────────────────────────
const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    billing: 'forever',
    label: 'For getting started',
    features: [
      '5 documents per month',
      'Basic PDF tools',
      'Document viewing',
      'Basic conversions',
      'Limited AI analysis',
    ],
    ctaText: 'Get Started',
    href: '/signup', // Matches existing project auth/signup destination in Navbar & Hero
    isPopular: false,
    ctaStyle:
      'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200/80',
    cardStyle:
      'bg-white border border-slate-200 shadow-2xs hover:shadow-md hover:border-slate-300',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '₹499',
    billing: '/ month',
    label: 'For everyday document work',
    badge: 'MOST POPULAR',
    features: [
      'Unlimited document workspace',
      'Advanced PDF tools',
      'PDF ↔ Word / Excel / PPT / JPG conversion',
      'Full AI document analysis',
      'Ask questions about documents',
      'Document history',
      'Priority processing',
    ],
    ctaText: 'Start Pro',
    isPopular: true,
    ctaStyle:
      'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm hover:shadow-md',
    cardStyle:
      'bg-white border-2 border-blue-600 shadow-[0_8px_30px_rgba(37,99,235,0.08)] hover:shadow-[0_12px_40px_rgba(37,99,235,0.14)]',
  },
  {
    id: 'business',
    name: 'Business',
    price: '₹999',
    billing: '/ month',
    label: 'For teams and power users',
    features: [
      'Everything in Pro',
      'Team document workspace',
      'Shared documents',
      'Advanced organization',
      'Higher AI usage limits',
      'Priority support',
    ],
    ctaText: 'Choose Business',
    isPopular: false,
    ctaStyle:
      'bg-slate-900 hover:bg-slate-800 text-white shadow-2xs hover:shadow-sm',
    cardStyle:
      'bg-white border border-slate-200 shadow-2xs hover:shadow-md hover:border-slate-300',
  },
];

export default function Pricing() {
  // Plan selection state: defaults to 'pro' as the most popular plan
  const [selectedPlan, setSelectedPlan] = useState('pro');

  return (
    <section
      id="pricing"
      aria-label="Pricing Plans"
      className="relative w-full py-12 sm:py-20 lg:py-28 xl:py-36 bg-slate-50/50 border-t border-slate-100 text-slate-900 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ========================================================
            SECTION HEADER
            ======================================================== */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-16 lg:mb-20">
          <div className="inline-flex items-center gap-2 px-2.5 sm:px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-[11px] sm:text-xs font-semibold uppercase tracking-wider mb-3 sm:mb-4">
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-600" />
            SIMPLE, FLEXIBLE PRICING
          </div>

          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-3 sm:mb-4 break-words">
            Choose the workspace that fits you.
          </h2>

          <p className="text-slate-600 text-sm sm:text-base lg:text-lg leading-relaxed">
            Start free and upgrade when you need more power.
          </p>
        </div>

        {/* ========================================================
            PRICING CARDS (Responsive Grid: 1-col mobile, 2-col tablet, 3-col desktop)
            ======================================================== */}
        <div
          role="radiogroup"
          aria-label="Pricing Plans Selection"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-6 xl:gap-8 items-stretch max-w-md md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto"
        >
          {PLANS.map((plan, idx) => {
            const isSelected = selectedPlan === plan.id;

            // Selection styles: subtle selection ring + border highlight + elevation
            const selectionClasses = isSelected
              ? 'ring-2 ring-blue-600 ring-offset-2 ring-offset-slate-50 border-blue-600 shadow-[0_12px_36px_rgba(37,99,235,0.14)] -translate-y-1'
              : 'hover:-translate-y-1';

            // Tablet layout: 2 columns with the 3rd card centered beneath
            const isLastCard = idx === 2;
            const tabletLayoutClass = isLastCard
              ? 'w-full max-w-md md:max-w-md md:col-span-2 md:mx-auto lg:max-w-none lg:col-span-1 lg:mx-0'
              : 'w-full max-w-md md:max-w-none mx-auto md:mx-0';

            return (
              <div
                key={plan.id}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => setSelectedPlan(plan.id)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    setSelectedPlan(plan.id);
                  }
                }}
                className={`relative w-full min-w-0 rounded-2xl sm:rounded-3xl p-5 sm:p-7 lg:p-6 xl:p-8 flex flex-col justify-between transition-all duration-300 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${plan.cardStyle} ${selectionClasses} ${tabletLayoutClass}`}
              >
                {/* Most Popular Badge on Pro Plan */}
                {plan.isPopular && (
                  <div className="absolute -top-3 sm:-top-3.5 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                    <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-blue-600 text-white text-[10px] sm:text-[11px] font-bold tracking-wider uppercase shadow-xs whitespace-nowrap">
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Top Section: Name, Selection Pill, Label, Price */}
                <div className="w-full min-w-0">
                  <div className="flex items-center justify-between gap-3 mb-1.5 sm:mb-2">
                    <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight break-words">
                      {plan.name}
                    </h3>

                    {/* Subtle Plan Selection Radio Indicator */}
                    <span
                      aria-hidden="true"
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 flex-shrink-0 ${
                        isSelected
                          ? 'border-blue-600 bg-blue-600'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-white block" />
                      )}
                    </span>
                  </div>

                  <p className="text-slate-500 text-xs sm:text-sm mb-5 sm:mb-6 font-medium break-words">
                    {plan.label}
                  </p>

                  {/* Price */}
                  <div className="flex items-baseline gap-1 sm:gap-1.5 mb-5 sm:mb-7 pb-5 sm:pb-7 border-b border-slate-100 flex-wrap">
                    <span className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">
                      {plan.price}
                    </span>
                    {plan.billing && (
                      <span className="text-xs sm:text-sm font-semibold text-slate-500">
                        {plan.billing}
                      </span>
                    )}
                  </div>

                  {/* Feature Checklist */}
                  <div className="mb-6 sm:mb-8 w-full min-w-0">
                    <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3 sm:mb-3.5">
                      Included features
                    </span>
                    <ul className="space-y-2.5 sm:space-y-3">
                      {plan.features.map((feature, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2.5 sm:gap-3 text-xs sm:text-sm text-slate-700 leading-snug"
                        >
                          <div className="mt-0.5 flex-shrink-0">
                            <CheckIcon
                              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${
                                plan.isPopular || isSelected
                                  ? 'text-blue-600'
                                  : 'text-slate-500'
                              }`}
                            />
                          </div>
                          <span className="break-words min-w-0">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* CTA Button */}
                <div className="pt-2 w-full">
                  {plan.href ? (
                    <a
                      href={plan.href}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className={`block w-full min-h-[44px] py-2.5 sm:py-3 px-4 sm:px-5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 cursor-pointer select-none text-center flex items-center justify-center ${plan.ctaStyle}`}
                    >
                      <span className="truncate">{plan.ctaText}</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className={`w-full min-h-[44px] py-2.5 sm:py-3 px-4 sm:px-5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 cursor-pointer select-none text-center flex items-center justify-center ${plan.ctaStyle}`}
                    >
                      <span className="truncate">{plan.ctaText}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}