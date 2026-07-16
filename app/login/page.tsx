"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getSession,
  signInWithPassword,
  resendVerificationEmail,
} from "@/lib/auth";
import {
  loginSchema,
  type LoginFormData,
  type LoginFieldErrors,
} from "@/lib/schemas";
import ApexLogo from "@/components/brand/ApexLogo";
import NavyBranding from "@/components/brand/NavyBranding";
import ThemeToggle from "@/components/theme/ThemeToggle";

type FieldErrors = LoginFieldErrors;

const getLoginFieldErrors = (result: any) => {
  if (result.success) return {};
  const flat = result.error.flatten().fieldErrors;
  return {
    email: flat.email?.[0],
    password: flat.password?.[0],
  };
};

const getAuthErrorMessage = (error: any) =>
  error?.message || "Authentication failed.";

interface AuthNotificationsProps {
  serverError: string | null;
  resendSuccess: boolean;
  needsVerification: boolean;
  loading: boolean;
  onResend: () => void;
}

function AuthNotifications({
  serverError,
  resendSuccess,
  needsVerification,
  loading,
  onResend,
}: AuthNotificationsProps) {
  if (serverError) {
    return (
      <div className="apex-banner-error">{serverError}</div>
    );
  }
  if (resendSuccess) {
    return (
      <div className="apex-banner-success">
        A new verification link has been sent to your email. Please check your
        inbox.
      </div>
    );
  }
  if (needsVerification) {
    return (
      <button
        onClick={onResend}
        disabled={loading}
        className="apex-btn-secondary w-full py-2.5 text-xs tracking-wide"
      >
        {loading
          ? "Sending..."
          : "Verification link expired? Click here to resend."}
      </button>
    );
  }
  return null;
}

interface LoginFormProps {
  credentials: LoginFormData;
  fieldErrors: FieldErrors;
  loading: boolean;
  onChange: (field: "email" | "password", value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  fieldClass: (field: keyof LoginFormData) => string;
}

function LoginForm({
  credentials,
  fieldErrors,
  loading,
  onChange,
  onSubmit,
  fieldClass,
}: LoginFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label className="apex-label" htmlFor="login-email">
          Email Address
        </label>
        <input
          id="login-email"
          type="email"
          value={credentials.email}
          onChange={(e) => onChange("email", e.target.value)}
          className={fieldClass("email")}
          placeholder="sailor@navy.mil"
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
        />
        {fieldErrors.email && (
          <p id="email-error" className="text-xs apex-text-field-error mt-1">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="apex-label" htmlFor="login-password">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          value={credentials.password}
          onChange={(e) => onChange("password", e.target.value)}
          className={fieldClass("password")}
          placeholder="••••••••"
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
        />
        {fieldErrors.password && (
          <p id="password-error" className="text-xs apex-text-field-error mt-1">
            {fieldErrors.password}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="apex-btn-primary w-full py-3 text-sm tracking-wide"
      >
        {loading ? "Authenticating..." : "Sign In"}
      </button>
    </form>
  );
}

function useLoginForm() {
  const router = useRouter();
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleChange = (field: "email" | "password", value: string) => {
    setCredentials((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field])
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = loginSchema.safeParse(credentials);
    if (!res.success) return setFieldErrors(getLoginFieldErrors(res));

    setFieldErrors({});
    setServerError(null);
    setNeedsVerification(false);
    setResendSuccess(false);
    setLoading(true);
    try {
      await signInWithPassword(res.data.email, res.data.password);
      const session = await getSession();
      if (!session) {
        setServerError(
          "Sign-in succeeded but the session was not saved. Clear site cookies for localhost and try again, or run `npm run dev:fresh`.",
        );
        setLoading(false);
        return;
      }
      // Full navigation so middleware receives auth cookies reliably.
      window.location.assign("/dashboard");
      return;
    } catch (error: any) {
      const raw = error?.message || "Authentication failed.";
      const msg =
        raw === "Invalid login credentials"
          ? "Invalid email or password. Stress-test users (e.g. co.enterprise@franklyn.dev) require `npm run db:seed-stress` against this Supabase project. Password: NavyEval!2026 — see docs/test-users-and-evals.md."
          : raw;
      setServerError(msg);
      if (msg.toLowerCase().includes("email not confirmed"))
        setNeedsVerification(true);
    }
    setLoading(false);
  };

  const handleResend = async () => {
    setServerError(null);
    setLoading(true);
    try {
      await resendVerificationEmail(credentials.email);
      setResendSuccess(true);
      setNeedsVerification(false);
    } catch (error: any) {
      setServerError(error?.message || "Authentication failed.");
    }
    setLoading(false);
  };

  const fieldClass = (field: keyof LoginFormData) =>
    `apex-input ${fieldErrors[field] ? "apex-input--invalid" : ""}`;

  return {
    credentials,
    fieldErrors,
    serverError,
    loading,
    needsVerification,
    resendSuccess,
    handleChange,
    handleLogin,
    fieldClass,
    handleResend,
  };
}

export default function LoginPage() {
  const {
    credentials,
    fieldErrors,
    serverError,
    loading,
    needsVerification,
    resendSuccess,
    handleChange,
    handleLogin,
    fieldClass,
    handleResend,
  } = useLoginForm();

  return (
    <div className="apex-auth-shell relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle compact />
      </div>
      <main
        id="main-content"
        className="w-full max-w-md p-8 rounded-2xl apex-card space-y-6"
      >
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <ApexLogo size="xl" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold apex-heading tracking-wide">
              Sign in
            </h2>
            <p className="text-sm apex-text-muted">
              Enter credentials to access evaluation portal
            </p>
          </div>
          <NavyBranding sidebar onLightSurface className="mt-2" />
        </div>

        <AuthNotifications
          serverError={serverError}
          resendSuccess={resendSuccess}
          needsVerification={needsVerification}
          loading={loading}
          onResend={handleResend}
        />

        <LoginForm
          credentials={credentials}
          fieldErrors={fieldErrors}
          loading={loading}
          onChange={handleChange}
          onSubmit={handleLogin}
          fieldClass={fieldClass}
        />

        <div className="text-center text-xs pt-2 apex-text-subtle">
          New to APEX?{" "}
          <Link href="/register" className="apex-link">
            Register for a profile
          </Link>
        </div>
      </main>
    </div>
  );
}
