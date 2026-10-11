import React, { useState, useEffect, useRef } from "react";

// ── Google Identity Services Script Loader (Singleton) ───────────────────────
const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let gsiScriptPromise = null;

function loadGoogleIdentityScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Browser environment is required."));
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google.accounts.id);
  }
  if (gsiScriptPromise) {
    return gsiScriptPromise;
  }

  gsiScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(
      `script[src="${GSI_SCRIPT_SRC}"]`
    );

    if (existingScript) {
      if (window.google?.accounts?.id) {
        resolve(window.google.accounts.id);
        return;
      }
      const handleLoad = () => {
        if (window.google?.accounts?.id) {
          resolve(window.google.accounts.id);
        } else {
          gsiScriptPromise = null;
          reject(new Error("Google Identity Services failed to initialize."));
        }
      };
      const handleError = () => {
        gsiScriptPromise = null;
        reject(new Error("Unable to load Google Sign-In script."));
      };
      existingScript.addEventListener("load", handleLoad, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.id) {
        resolve(window.google.accounts.id);
      } else {
        gsiScriptPromise = null;
        reject(new Error("Google Identity Services failed to initialize."));
      }
    };
    script.onerror = () => {
      gsiScriptPromise = null;
      reject(new Error("Unable to load Google Sign-In script."));
    };
    document.head.appendChild(script);
  });

  return gsiScriptPromise;
}

// ── Google "G" SVG Icon ───────────────────────────────────────────────────────
function GoogleIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

// ── Eye Show / Hide Icon ─────────────────────────────────────────────────────
function EyeIcon({ isVisible, className = "w-4 h-4" }) {
  if (isVisible) {
    return (
      <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
      </svg>
    );
  }
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// ── Small Spinner ────────────────────────────────────────────────────────────
function Spinner({ className = "w-4 h-4 text-white" }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

const DEFAULT_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");

export default function AuthModal({
  isOpen = false,
  initialMode = "login", // "login" | "signup"
  onClose,
  onSuccess,
  apiBaseUrl = DEFAULT_API_BASE_URL, // Set to your Express backend URL, e.g., "http://localhost:5000" or empty string if proxied
}) {
  const resolvedApiBaseUrl = apiBaseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
  const [mode, setMode] = useState(initialMode); // "login" | "signup"
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const modalRef = useRef(null);
  const firstInputRef = useRef(null);
  const googleInFlightRef = useRef(false);
  const googleCallbackRef = useRef(null);

  // Sync mode with initialMode prop when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setSuccessMsg(null);
      setFormData({ name: "", email: "", password: "", confirmPassword: "" });
      setShowPassword(false);
      setShowConfirmPassword(false);
      setLoading(false);
      googleInFlightRef.current = false;
    }
  }, [isOpen, initialMode]);

  // Preload Google Identity Services script quietly when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
    if (clientId) {
      loadGoogleIdentityScript().catch(() => {
        // Handled explicitly if the user clicks "Continue with Google"
      });
    }
  }, [isOpen]);

  // Trap body scroll when modal is active
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Focus the first input upon opening
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        firstInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, mode]);

  // Keep latest Google credential handler in ref to avoid stale closures or duplicate listeners
  googleCallbackRef.current = async (credentialResponse) => {
    const googleCredential = credentialResponse?.credential;
    if (!googleCredential || typeof googleCredential !== "string") {
      googleInFlightRef.current = false;
      setLoading(false);
      setError("No valid Google credential was returned. Please try again.");
      return;
    }

    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const response = await fetch(`${resolvedApiBaseUrl}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: googleCredential }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || data?.success === false || !data?.token || !data?.user) {
        throw new Error(
          data?.message ||
            data?.error ||
            "Google authentication failed. Please try again."
        );
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      setSuccessMsg(
        mode === "login" ? "Signed in successfully!" : "Account created successfully!"
      );

      setTimeout(() => {
        onSuccess?.(data);
        onClose?.();
      }, 600);
    } catch (err) {
      setError(
        err.message || "Unable to complete Google sign-in. Please try again."
      );
    } finally {
      googleInFlightRef.current = false;
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  };

  // Close when clicking outside of the modal surface
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose?.();
    }
  };

  // ── Form Submission to Express Backend ───────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || googleInFlightRef.current) return;

    setError(null);
    setSuccessMsg(null);

    // Client-side validations
    if (!formData.email.trim() || !formData.password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    if (mode === "signup") {
      if (!formData.name.trim()) {
        setError("Please enter your full name.");
        return;
      }
      if (formData.password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);

    try {
      const endpoint =
        mode === "login"
          ? `${resolvedApiBaseUrl}/api/auth/login`
          : `${resolvedApiBaseUrl}/api/auth/signup`;

      const payload =
        mode === "login"
          ? { email: formData.email.trim(), password: formData.password }
          : {
              name: formData.name.trim(),
              email: formData.email.trim(),
              password: formData.password,
            };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || data?.success === false) {
        throw new Error(
          data?.message ||
            data?.error ||
            (mode === "login"
              ? "Invalid email or password."
              : "Unable to create account. Please try again.")
        );
      }

      // If signup succeeds without returning a JWT token, prompt user to sign in
      // instead of navigating to an authenticated dashboard without a valid token.
      if (mode === "signup" && !data?.token) {
        setMode("login");
        setFormData((prev) => ({
          ...prev,
          password: "",
          confirmPassword: "",
        }));
        setSuccessMsg("Account created successfully! Please sign in.");
        return;
      }

      if (!data?.token || !data?.user) {
        throw new Error(
          "Authentication succeeded, but no valid session token was returned."
        );
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      setSuccessMsg(
        mode === "login" ? "Signed in successfully!" : "Account created successfully!"
      );

      // Brief confirmation before closing or triggering parent callback
      setTimeout(() => {
        onSuccess?.(data);
        onClose?.();
      }, 600);
    } catch (err) {
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Google OAuth Integration Point ──────────────────────────────────────────
  const handleGoogleAuth = async () => {
    if (loading || googleInFlightRef.current) return;

    setError(null);
    setSuccessMsg(null);

    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
    if (!googleClientId) {
      setError(
        "Google Sign-In is not configured. Missing VITE_GOOGLE_CLIENT_ID in environment variables."
      );
      return;
    }

    googleInFlightRef.current = true;
    setLoading(true);

    try {
      const googleId = await loadGoogleIdentityScript();

      // Clear first-party GIS cooldown cookie if user previously dismissed the prompt
      document.cookie =
        "g_state=;path=/;expires=Thu, 01 Jan 1970 00:00:01 GMT";

      googleId.initialize({
        client_id: googleClientId,
        callback: (response) => googleCallbackRef.current?.(response),
        auto_select: false,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: true,
      });

      googleId.prompt((notification) => {
        if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
          googleInFlightRef.current = false;
          setLoading(false);
          setError(
            "Google Sign-In prompt could not be opened. Please make sure you are signed into a Google account in this browser or continue with email."
          );
        } else if (notification.isDismissedMoment?.()) {
          const reason = notification.getDismissedReason?.();
          if (reason !== "credential_returned") {
            googleInFlightRef.current = false;
            setLoading(false);
          }
        }
      });
    } catch (err) {
      googleInFlightRef.current = false;
      setLoading(false);
      setError(
        err.message ||
          "Unable to load Google Sign-In. Please check your connection and try again."
      );
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-5 overflow-y-auto bg-slate-950/40 backdrop-blur-sm transition-all duration-300"
      aria-modal="true"
      role="dialog"
      aria-labelledby="auth-modal-title"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[540px] my-auto bg-[#F3F4F6] rounded-2xl border border-slate-200/90 shadow-2xl shadow-slate-900/10 overflow-hidden transition-all duration-200"
      >
        {/* ── Small Accessible Close Button ─────────────────────────────────── */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 w-8 h-8 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer z-10"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="px-6 py-6 sm:px-8 sm:py-7 md:px-9 md:py-8">
          {/* ── Top Centered Brand Logo ─────────────────────────────────────── */}
          <div className="flex justify-center mb-3 sm:mb-3.5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs"
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
              }}
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>

          {/* ── Modal Titles ────────────────────────────────────────────────── */}
          <div className="text-center mb-4 sm:mb-5">
            <h2
              id="auth-modal-title"
              className="text-2xl sm:text-[25px] font-extrabold text-slate-900 tracking-tight leading-tight"
            >
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 font-normal">
              {mode === "login"
                ? "Sign in to your workspace"
                : "Start working smarter with your documents"}
            </p>
          </div>

          {/* ── Continue with Google ────────────────────────────────────────── */}
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full min-h-[44px] py-2 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold flex items-center justify-center gap-3 transition-colors duration-150 shadow-2xs active:scale-[0.99] cursor-pointer"
          >
            <GoogleIcon className="w-4 h-4 flex-shrink-0" />
            <span>Continue with Google</span>
          </button>

          {/* ── Clean Horizontal Email Divider ──────────────────────────────── */}
          <div className="relative my-4 sm:my-4.5">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-slate-300/80" />
            </div>
            <div className="relative flex justify-center text-[10px] sm:text-[11px] uppercase">
              <span className="bg-[#F3F4F6] px-3 text-slate-400 font-semibold tracking-wider">
                OR CONTINUE WITH EMAIL
              </span>
            </div>
          </div>

          {/* ── Status Messages ────────────────────────────────────────────── */}
          {error && (
            <div className="mb-3.5 p-2.5 sm:p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm flex items-start gap-2">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 7.5h.008v.008H12v-.008z" />
              </svg>
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-3.5 p-2.5 sm:p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs sm:text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span>{successMsg}</span>
            </div>
          )}

          {/* ── Authentication Form ────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4" noValidate>
            {/* Full Name (Sign Up only) */}
            {mode === "signup" && (
              <div>
                <label
                  htmlFor="auth-name"
                  className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1"
                >
                  Full Name
                </label>
                <input
                  ref={firstInputRef}
                  id="auth-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all bg-white"
                />
              </div>
            )}

            {/* Email Address */}
            <div>
              <label
                htmlFor="auth-email"
                className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1"
              >
                Email Address
              </label>
              <input
                ref={mode === "login" ? firstInputRef : null}
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={handleInputChange}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all bg-white"
              />
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="auth-password"
                  className="block text-xs sm:text-sm font-semibold text-slate-800"
                >
                  Password
                </label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => {
                      /* Connect password reset flow */
                      alert("Please contact your administrator or check the reset link on your registered email.");
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full min-h-[42px] pl-3.5 pr-11 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                >
                  <EyeIcon isVisible={showPassword} />
                </button>
              </div>
            </div>

            {/* Confirm Password (Sign Up only) */}
            {mode === "signup" && (
              <div>
                <label
                  htmlFor="auth-confirm-password"
                  className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id="auth-confirm-password"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className="w-full min-h-[42px] pl-3.5 pr-11 py-2 rounded-xl border border-slate-300 text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                  >
                    <EyeIcon isVisible={showConfirmPassword} />
                  </button>
                </div>
              </div>
            )}

            {/* Solid Primary Button */}
            <div className="pt-1 sm:pt-1.5">
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors duration-150 cursor-pointer select-none flex items-center justify-center gap-2 shadow-xs active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading && <Spinner />}
                <span>
                  {loading
                    ? mode === "login"
                      ? "Signing In..."
                      : "Creating Account..."
                    : mode === "login"
                    ? "Sign In"
                    : "Create Account"}
                </span>
              </button>
            </div>
          </form>

          {/* ── Switch Mode Footer ─────────────────────────────────────────── */}
          <div className="mt-4 sm:mt-5 text-center text-xs sm:text-sm text-slate-500">
            {mode === "login" ? (
              <p>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                  className="font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                >
                  Create account
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                  className="font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}