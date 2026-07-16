"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUpWithEmail } from "@/lib/auth";
import {
  NAVY_RANKS,
  ROLES,
  registerSchema,
  type RegisterFormData,
  type RegisterFieldErrors,
} from "@/lib/schemas";
import { z } from "zod";
import ApexLogo from "@/components/brand/ApexLogo";
import NavyBranding from "@/components/brand/NavyBranding";
import ThemeToggle from "@/components/theme/ThemeToggle";

function formatZodErrors(
  error: z.ZodError<RegisterFormData>,
): RegisterFieldErrors {
  const flat = error.flatten().fieldErrors;
  const formatted: RegisterFieldErrors = {};
  for (const [key, value] of Object.entries(flat)) {
    if (value && value.length > 0) {
      formatted[key as keyof RegisterFormData] = value[0];
    }
  }
  return formatted;
}

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: React.ReactNode;
  error?: string;
  fieldClass: string;
  containerClassName?: string;
}

function FormInput({
  label,
  error,
  fieldClass,
  containerClassName = "space-y-1.5",
  id,
  ...props
}: FormInputProps) {
  return (
    <div className={containerClassName}>
      <label className="apex-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className={fieldClass} {...props} />
      {error && <p className="text-xs apex-text-field-error">{error}</p>}
    </div>
  );
}

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: React.ReactNode;
  error?: string;
  fieldClass: string;
  containerClassName?: string;
  children: React.ReactNode;
}

function FormSelect({
  label,
  error,
  fieldClass,
  containerClassName = "space-y-1.5",
  children,
  id,
  ...props
}: FormSelectProps) {
  const invalid = /\bapex-input--invalid\b/.test(fieldClass);
  const selectClass = `apex-select${invalid ? " apex-select--invalid" : ""}`;
  return (
    <div className={containerClassName}>
      <label className="apex-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={selectClass}
        aria-label={typeof label === "string" ? label : undefined}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs apex-text-field-error">{error}</p>}
    </div>
  );
}

function RegistrationSuccess({ email }: { email: string }) {
  return (
    <div className="apex-auth-shell relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle compact />
      </div>
      <main
        id="main-content"
        className="w-full max-w-lg p-8 rounded-2xl apex-card space-y-6 text-center"
      >
        <h2 className="text-2xl font-bold apex-text-success tracking-wide">
          Registration Submitted
        </h2>
        <p className="text-sm apex-text-muted">
          We have sent a secure verification link to <strong>{email}</strong>.
          Please check your inbox and click the link to confirm your identity
          before logging in.
        </p>
        <div className="pt-6">
          <Link href="/login" className="apex-btn-secondary text-sm">
            Return to Login
          </Link>
        </div>
      </main>
    </div>
  );
}

const RANK_LABELS: Record<string, string> = {
  SR: "SR (E-1)",
  SA: "SA (E-2)",
  SN: "SN (E-3)",
  PO3: "PO3 (E-4)",
  PO2: "PO2 (E-5)",
  PO1: "PO1 (E-6)",
  CPO: "CPO (E-7)",
  SCPO: "SCPO (E-8)",
  MCPO: "MCPO (E-9)",
  WO2: "WO2 (W-2)",
  WO3: "WO3 (W-3)",
  WO4: "WO4 (W-4)",
  WO5: "WO5 (W-5)",
  ENS: "ENS (O-1)",
  LTJG: "LTJG (O-2)",
  LT: "LT (O-3)",
  LCDR: "LCDR (O-4)",
  CDR: "CDR (O-5)",
  CAPT: "CAPT (O-6)",
};

const ROLE_LABELS: Record<string, string> = {
  Sailor: "Sailor (Self-Drafting)",
  Rater: "Rater (E-7 / Supervisor)",
  "Senior Rater": "Senior Rater (Division Officer / Chief)",
  "Reporting Senior": "Reporting Senior (Commanding Officer)",
  Admin: "Admin",
};

interface SectionProps {
  formData: any;
  onChange: (field: any, val: string) => void;
  fieldErrors: RegisterFieldErrors;
  fieldClass: (field: any) => string;
}

function PersonalFields({
  formData,
  onChange,
  fieldErrors,
  fieldClass,
}: SectionProps) {
  return (
    <>
      <FormInput
        id="reg-first-name"
        label="First Name"
        type="text"
        value={formData.firstName}
        onChange={(e) => onChange("firstName", e.target.value)}
        fieldClass={fieldClass("firstName")}
        placeholder="JOHN"
        error={fieldErrors.firstName}
      />
      <FormInput
        id="reg-last-name"
        label="Last Name"
        type="text"
        value={formData.lastName}
        onChange={(e) => onChange("lastName", e.target.value)}
        fieldClass={fieldClass("lastName")}
        placeholder="DOE"
        error={fieldErrors.lastName}
      />
      <FormInput
        id="reg-mi"
        label="M.I."
        type="text"
        maxLength={1}
        value={formData.middleInitial}
        onChange={(e) =>
          onChange("middleInitial", e.target.value.toUpperCase())
        }
        fieldClass={fieldClass("middleInitial")}
        placeholder="A"
        error={fieldErrors.middleInitial}
      />
      <FormInput
        id="reg-dod-id"
        label="DoD ID Number"
        type="text"
        maxLength={10}
        value={formData.dodId}
        onChange={(e) =>
          onChange("dodId", e.target.value.replace(/[^0-9]/g, ""))
        }
        fieldClass={fieldClass("dodId")}
        placeholder="1234567890"
        error={fieldErrors.dodId}
      />
    </>
  );
}

function ProfessionalFields({
  formData,
  onChange,
  fieldErrors,
  fieldClass,
}: SectionProps) {
  return (
    <>
      <FormSelect
        id="reg-rank"
        label="Navy Rank/Rate"
        value={formData.rank}
        onChange={(e) => onChange("rank", e.target.value)}
        fieldClass={fieldClass("rank")}
        error={fieldErrors.rank}
      >
        {NAVY_RANKS.map((r) => (
          <option key={r} value={r}>
            {RANK_LABELS[r] || r}
          </option>
        ))}
      </FormSelect>
      <FormInput
        id="reg-uic"
        label={
          <>
            UIC{" "}
            <span className="normal-case font-normal apex-text-subtle">
              (optional)
            </span>
          </>
        }
        type="text"
        maxLength={5}
        value={formData.uic}
        onChange={(e) => onChange("uic", e.target.value.toUpperCase())}
        fieldClass={fieldClass("uic")}
        placeholder="12345"
        error={fieldErrors.uic}
      />
      <FormInput
        id="reg-command"
        label="Command"
        type="text"
        value={formData.command}
        onChange={(e) => onChange("command", e.target.value)}
        fieldClass={fieldClass("command")}
        placeholder="USS NEVERSAIL"
        error={fieldErrors.command}
      />
      <FormSelect
        id="reg-role"
        label="Preferred Evaluation Role"
        value={formData.role}
        onChange={(e) => onChange("role", e.target.value)}
        fieldClass={fieldClass("role")}
        error={fieldErrors.role}
        containerClassName="space-y-1.5 md:col-span-2"
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role] || role}
          </option>
        ))}
      </FormSelect>
    </>
  );
}

function AccountFields({
  formData,
  onChange,
  fieldErrors,
  fieldClass,
}: SectionProps) {
  return (
    <>
      <FormInput
        id="reg-email"
        label="Email Address"
        type="email"
        value={formData.email}
        onChange={(e) => onChange("email", e.target.value)}
        fieldClass={fieldClass("email")}
        placeholder="sailor@navy.mil"
        error={fieldErrors.email}
        containerClassName="space-y-1.5 md:col-span-2 border-t border-[var(--border)] pt-4 mt-2"
      />
      <FormInput
        id="reg-password"
        label="Password"
        type="password"
        value={formData.password}
        onChange={(e) => onChange("password", e.target.value)}
        fieldClass={fieldClass("password")}
        placeholder="••••••••"
        error={fieldErrors.password}
        containerClassName="space-y-1.5 md:col-span-2"
      />
    </>
  );
}

interface RegisterFormProps {
  formData: any;
  fieldErrors: RegisterFieldErrors;
  loading: boolean;
  onChange: (field: any, val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  fieldClass: (field: any) => string;
}

function RegisterForm({
  formData,
  fieldErrors,
  loading,
  onChange,
  onSubmit,
  fieldClass,
}: RegisterFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 md:grid-cols-2 gap-4"
      noValidate
    >
      <PersonalFields
        formData={formData}
        onChange={onChange}
        fieldErrors={fieldErrors}
        fieldClass={fieldClass}
      />
      <ProfessionalFields
        formData={formData}
        onChange={onChange}
        fieldErrors={fieldErrors}
        fieldClass={fieldClass}
      />
      <AccountFields
        formData={formData}
        onChange={onChange}
        fieldErrors={fieldErrors}
        fieldClass={fieldClass}
      />

      <button
        type="submit"
        disabled={loading}
        className="apex-btn-primary w-full py-3 text-sm tracking-wide md:col-span-2 mt-2"
      >
        {loading ? "Creating Account..." : "Complete Registration"}
      </button>
    </form>
  );
}

function useRegisterForm() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    middleInitial: "",
    dodId: "",
    rank: "SN" as (typeof NAVY_RANKS)[number],
    uic: "",
    command: "",
    role: "Sailor" as (typeof ROLES)[number],
    email: "",
    password: "",
  });

  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = registerSchema.safeParse({
      ...formData,
      middleInitial: formData.middleInitial || undefined,
      uic: formData.uic || undefined,
    });

    if (!result.success) {
      setFieldErrors(formatZodErrors(result.error));
      return;
    }

    setFieldErrors({});
    setServerError(null);
    setLoading(true);

    try {
      await signUpWithEmail(result.data.email, result.data.password, {
        firstName: result.data.firstName,
        lastName: result.data.lastName,
        middleInitial: result.data.middleInitial,
        dodId: result.data.dodId,
        uic: result.data.uic,
        navyRank: result.data.rank,
        command: result.data.command,
        preferredRole: result.data.role,
      });
      setIsSubmitted(true);
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : "Registration failed. Please review inputs.";
      setServerError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = (field: keyof RegisterFormData) =>
    `apex-input ${fieldErrors[field] ? "apex-input--invalid" : ""}`;

  return {
    formData,
    fieldErrors,
    serverError,
    loading,
    isSubmitted,
    handleChange,
    handleRegister,
    fieldClass,
  };
}

export default function RegisterPage() {
  const {
    formData,
    fieldErrors,
    serverError,
    loading,
    isSubmitted,
    handleChange,
    handleRegister,
    fieldClass,
  } = useRegisterForm();

  if (isSubmitted) {
    return <RegistrationSuccess email={formData.email} />;
  }

  return (
    <div className="apex-auth-shell relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle compact />
      </div>
      <main
        id="main-content"
        className="w-full max-w-lg p-8 rounded-2xl apex-card space-y-6"
      >
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <ApexLogo size="xl" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold apex-heading tracking-wide">
              APEX Registry
            </h2>
            <p className="text-sm apex-text-muted">
              Create a new profile to access the evaluation platform
            </p>
          </div>
          <NavyBranding sidebar onLightSurface className="mt-2" />
        </div>

        {serverError && (
          <div className="apex-banner-error">
            {serverError}
          </div>
        )}

        <RegisterForm
          formData={formData}
          fieldErrors={fieldErrors}
          loading={loading}
          onChange={handleChange}
          onSubmit={handleRegister}
          fieldClass={fieldClass}
        />

        <div className="text-center text-xs pt-2 apex-text-subtle">
          Already registered?{" "}
          <Link href="/login" className="apex-link">
            Sign In here
          </Link>
        </div>
      </main>
    </div>
  );
}
