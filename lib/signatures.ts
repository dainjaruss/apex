// lib/signatures.ts
//
// Shared metadata for the NAVPERS 1616/26 signature blocks. Imported by the report
// screen (Sign buttons), the credential modal, and the /api/sign enforcement route,
// so the block -> block_values key mapping lives in exactly one place.
//

export interface SignatureBlockMeta {
  block: number;
  /** base block_values key holding the typed name; `${key}_data` / `${key}_date` hold the PNG + date */
  key: string;
  label: string;
  /** human description of who is expected to sign, used in UI hints */
  signer: string;
}

export const SIGNATURE_BLOCKS: SignatureBlockMeta[] = [
  {
    block: 42,
    key: "rater_signature",
    label: "Rater Signature",
    signer: "Rater",
  },
  {
    block: 49,
    key: "senior_rater_signature",
    label: "Senior Rater Signature",
    signer: "Senior Rater",
  },
  {
    block: 50,
    key: "reporting_senior_signature",
    label: "Reporting Senior Signature",
    signer: "Reporting Senior",
  },
  {
    block: 51,
    key: "member_signature",
    label: "Individual Evaluated (Member) Signature",
    signer: "evaluated member",
  },
  {
    block: 52,
    key: "concurrent_rs_signature",
    label: "Regular RS Signature — Concurrent Report",
    signer: "Reporting Senior",
  },
  {
    block: 32,
    key: "individual_counseled_signature",
    label: "Signature of Individual Counseled",
    signer: "evaluated member",
  },
];

export const SIGNATURE_KEY_BY_BLOCK: Record<number, string> =
  SIGNATURE_BLOCKS.reduce(
    (acc, s) => {
      acc[s.block] = s.key;
      return acc;
    },
    {} as Record<number, string>,
  );
