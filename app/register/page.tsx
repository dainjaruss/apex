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
  ...props
}: FormInputProps) {
  return (
    <div className={containerClassName}>
      <label className="text-xs font-semibold text-[#91aec9] uppercase tracking-wider">
        {label}
      </label>
      <input className={fieldClass} {...props} />
      {error && <p className="text-xs text-red-400">{error}</p>}
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
  ...props
}: FormSelectProps) {
  return (
    <div className={containerClassName}>
      <label className="text-xs font-semibold text-[#91aec9] uppercase tracking-wider">
        {label}
      </label>
      <select className={fieldClass} {...props}>
        {children}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function RegistrationSuccess({ email }: { email: string }) {
  return (
    <div className="flex min-h-screen bg-[#0b132b] items-center justify-center p-4">
      <div className="w-full max-w-lg p-8 rounded-2xl glass-panel space-y-6 text-center">
        <h2 className="text-2xl font-bold text-green-400 tracking-wide">
          Registration Submitted
        </h2>
        <p className="text-[#91aec9] text-sm">
          We have sent a secure verification link to <strong>{email}</strong>.
          Please check your inbox and click the link to confirm your identity
          before logging in.
        </p>
        <div className="pt-6">
          <Link
            href="/login"
            className="text-sm font-semibold text-[#3e6e99] hover:text-[#91aec9] transition-colors"
          >
            Return to Login
          </Link>
        </div>
      </div>
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
            <span className="text-[#608bb3] normal-case font-normal">
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
        containerClassName="space-y-1.5 md:col-span-2 border-t border-[#1c2541] pt-4 mt-2"
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
        className="w-full py-3 rounded-lg bg-blue-700 hover:bg-blue-600 font-bold transition-all disabled:opacity-50 text-sm tracking-wide shadow-lg shadow-blue-900/20 md:col-span-2 mt-2"
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
    `w-full px-4 py-2.5 rounded bg-[#1c2541] border text-[#f0f4f8] focus:outline-none transition-all text-sm ${
      fieldErrors[field]
        ? "border-red-500/70 focus:border-red-400"
        : "border-slate-700/50 focus:border-[#3e6e99]"
    }`;

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
    <div className="flex min-h-screen bg-[#0b132b] items-center justify-center p-4">
      <div className="w-full max-w-lg p-8 rounded-2xl glass-panel space-y-6">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <ApexLogo size="xl" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-white tracking-wide">
              APEX Registry
            </h2>
            <p className="text-sm text-[#91aec9]">
              Create a new profile to access the evaluation platform
            </p>
          </div>
          <NavyBranding sidebar className="mt-2" />
        </div>

        {serverError && (
          <div className="p-3.5 rounded bg-red-950/40 border border-red-800/40 text-xs text-red-300">
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

        <div className="text-center text-xs text-[#608bb3] pt-2">
          Already registered?{" "}
          <Link href="/login" className="text-blue-400 hover:underline">
            Sign In here
          </Link>
        </div>
      </div>
    </div>
  );
}
