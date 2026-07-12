"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSession, getSessionUserId } from "@/lib/auth";
import { getProfile, updateProfile } from "@/lib/profileService";

interface ProfileData {
  firstName: string;
  lastName: string;
  mi: string;
  dodId: string;
  email: string;
  rank: string;
  uic: string;
  command: string;
  role: "Sailor" | "Rater" | "Senior Rater" | "Reporting Senior" | "Admin";
}

const fieldMapping: Record<keyof ProfileData, string> = {
  firstName: "first_name",
  lastName: "last_name",
  mi: "middle_initial",
  dodId: "dod_id",
  email: "email",
  rank: "navy_rank",
  uic: "uic",
  command: "command",
  role: "preferred_role",
};

function getCleanProfileUpdates(form: ProfileData) {
  const cleaned = Object.fromEntries(
    Object.entries(form).map(([k, v]) => [k, v || undefined]),
  ) as any;

  return {
    firstName: cleaned.firstName,
    lastName: cleaned.lastName,
    middleInitial: cleaned.mi,
    dodId: cleaned.dodId,
    uic: cleaned.uic,
    navyRank: cleaned.rank,
    command: cleaned.command,
    preferredRole: cleaned.role,
  };
}

const getErrorMessage = (err: any) =>
  err?.message || "Failed to update profile settings";

function valToString(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function valToRole(
  v: any,
): "Sailor" | "Rater" | "Senior Rater" | "Reporting Senior" | "Admin" {
  if (
    v === "Sailor" ||
    v === "Rater" ||
    v === "Senior Rater" ||
    v === "Reporting Senior" ||
    v === "Admin"
  ) {
    return v;
  }
  return "Sailor";
}

function ProfileHeader() {
  return (
    <header className="px-6 py-4 flex items-center justify-between border-b border-[#1c2541] glass-panel">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="font-extrabold text-xl tracking-wider text-white hover:text-[#91aec9] transition-colors"
        >
          APEX
        </Link>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#1c2541] text-[#3e6e99]">
          PROFILE
        </span>
      </div>
      <Link
        href="/dashboard"
        className="text-xs font-semibold text-[#91aec9] hover:text-white transition-colors"
      >
        Back to Dashboard
      </Link>
    </header>
  );
}

interface ProfileFormFieldsProps {
  formData: ProfileData;
  loading: boolean;
  onChange: (key: keyof ProfileData, value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function ProfileInput({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  maxLength,
  pattern,
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
  maxLength?: number;
  pattern?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="text-xs font-semibold text-[#91aec9] uppercase tracking-wider">
        {label}
      </label>
      <input
        type={type}
        required={required}
        maxLength={maxLength}
        pattern={pattern}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full px-4 py-2.5 rounded bg-[#1c2541] border border-slate-700/50 text-[#f0f4f8] focus:outline-none focus:border-[#3e6e99] transition-all text-sm"
      />
    </div>
  );
}

function ProfilePersonalFields({
  formData,
  onChange,
}: {
  formData: ProfileData;
  onChange: (key: keyof ProfileData, value: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <ProfileInput
          label="First Name"
          required
          value={formData.firstName}
          onChange={(e) => onChange("firstName", e.target.value)}
        />
        <ProfileInput
          label="Last Name"
          required
          value={formData.lastName}
          onChange={(e) => onChange("lastName", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <ProfileInput
          label="M.I."
          maxLength={1}
          value={formData.mi}
          onChange={(e) => onChange("mi", e.target.value.toUpperCase())}
        />
        <ProfileInput
          label="DoD ID Number"
          pattern="^[0-9]{10}$"
          maxLength={10}
          required
          value={formData.dodId}
          onChange={(e) =>
            onChange("dodId", e.target.value.replace(/[^0-9]/g, ""))
          }
          className="col-span-2"
        />
      </div>
    </>
  );
}

function ProfileProfessionalFields({
  formData,
  onChange,
}: {
  formData: ProfileData;
  onChange: (key: keyof ProfileData, value: string) => void;
}) {
  return (
    <>
      <ProfileInput
        label="Navy Rank"
        required
        value={formData.rank}
        onChange={(e) => onChange("rank", e.target.value)}
      />

      <div className="grid grid-cols-3 gap-4">
        <ProfileInput
          label="UIC"
          maxLength={5}
          value={formData.uic}
          onChange={(e) => onChange("uic", e.target.value.toUpperCase())}
          placeholder="12345"
        />
        <ProfileInput
          label="Command"
          required
          value={formData.command}
          onChange={(e) => onChange("command", e.target.value)}
          placeholder="USS NEVERSAIL"
          className="col-span-2"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[#91aec9] uppercase tracking-wider">
          Preferred Evaluation Role
        </label>
        <select
          value={formData.role}
          onChange={(e) => onChange("role", e.target.value as any)}
          className="w-full px-4 py-2.5 rounded bg-[#1c2541] border border-slate-700/50 text-[#f0f4f8] focus:outline-none focus:border-[#3e6e99] transition-all text-sm"
        >
          <option value="Sailor">Sailor (Self-Drafting)</option>
          <option value="Rater">Rater (E-7 / Supervisor)</option>
          <option value="Senior Rater">
            Senior Rater (Division Officer / Chief)
          </option>
          <option value="Reporting Senior">
            Reporting Senior (Commanding Officer)
          </option>
          <option value="Admin">Admin</option>
        </select>
      </div>
    </>
  );
}

function ProfileFormFields({
  formData,
  loading,
  onChange,
  onSubmit,
}: ProfileFormFieldsProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <ProfilePersonalFields formData={formData} onChange={onChange} />

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[#608bb3] uppercase tracking-wider">
          Email (Read Only)
        </label>
        <input
          type="email"
          disabled
          value={formData.email}
          className="w-full px-4 py-2.5 rounded bg-[#1c2541]/40 border border-slate-800 text-slate-400 focus:outline-none cursor-not-allowed text-sm"
        />
      </div>

      <ProfileProfessionalFields formData={formData} onChange={onChange} />

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-lg bg-blue-700 hover:bg-blue-600 font-bold transition-all disabled:opacity-50 text-sm tracking-wide shadow-lg shadow-blue-900/20 pt-2"
      >
        {loading ? "Saving updates..." : "Save Profile Details"}
      </button>
    </form>
  );
}

interface ProfileContentProps {
  formData: ProfileData;
  loading: boolean;
  success: boolean;
  err: string | null;
  onChange: (key: keyof ProfileData, value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function ProfileContent({
  formData,
  loading,
  success,
  err,
  onChange,
  onSubmit,
}: ProfileContentProps) {
  return (
    <main className="flex-1 max-w-xl w-full mx-auto p-6 flex items-center justify-center">
      <div className="w-full p-8 rounded-2xl glass-panel space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white tracking-wide">
            Military Identity
          </h2>
          <p className="text-sm text-[#91aec9]">
            Update rank, command, and routing role permissions
          </p>
        </div>

        {err && (
          <div className="p-3.5 rounded bg-red-950/40 border border-red-800/40 text-xs text-red-300">
            {err}
          </div>
        )}

        {success && (
          <div className="p-3.5 rounded bg-green-950/40 border border-green-800/40 text-xs text-green-300">
            Profile updated successfully.
          </div>
        )}

        <ProfileFormFields
          formData={formData}
          loading={loading}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      </div>
    </main>
  );
}

function useProfileForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProfileData>({
    firstName: "",
    lastName: "",
    mi: "",
    dodId: "",
    email: "",
    rank: "",
    uic: "",
    command: "",
    role: "Sailor",
  });

  useEffect(() => {
    const loadProfileData = async () => {
      const userId = await getSessionUserId();
      if (!userId) {
        router.push("/login");
        return;
      }

      try {
        const d = await getProfile(userId);
        if (d) {
          setFormData({
            firstName: valToString(d.first_name),
            lastName: valToString(d.last_name),
            mi: valToString(d.middle_initial),
            dodId: valToString(d.dod_id),
            email: valToString(d.email),
            rank: valToString(d.navy_rank),
            uic: valToString(d.uic),
            command: valToString(d.command),
            role: valToRole(d.preferred_role),
          });
        }
      } catch (error: any) {
        setErr(error.message || "Failed to load profile details");
      }
    };

    loadProfileData();
  }, [router]);

  const handleChange = (key: keyof ProfileData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setSuccess(false);

    try {
      const userId = await getSessionUserId();
      if (!userId) throw new Error("Not authenticated");
      await updateProfile(userId, getCleanProfileUpdates(formData));
      setSuccess(true);
    } catch (error: any) {
      setErr(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return {
    formData,
    loading,
    success,
    err,
    handleChange,
    handleUpdate,
  };
}

export default function ProfilePage() {
  const { formData, loading, success, err, handleChange, handleUpdate } =
    useProfileForm();

  return (
    <div className="flex flex-col min-h-screen bg-[#0b132b] text-[#f0f4f8]">
      <ProfileHeader />
      <ProfileContent
        formData={formData}
        loading={loading}
        success={success}
        err={err}
        onChange={handleChange}
        onSubmit={handleUpdate}
      />
    </div>
  );
}
