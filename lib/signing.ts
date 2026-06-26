// lib/signing.ts
//
// Small, single-purpose helpers for the /api/sign enforcement route. Extracting the
// route's sequential guards here keeps the POST handler a thin orchestrator (and out of
// fallow's CRITICAL-complexity band). Behavior is identical to the inline version.

import { createAdminClient, createCredentialVerifierClient } from './supabaseClient'
import { canSignBlock } from './permissions'
import { SIGNATURE_KEY_BY_BLOCK } from './signatures'
import { Profile, Evaluation } from '@/types'

type AdminClient = ReturnType<typeof createAdminClient>
export type SignFailure = { error: string; status: number }
export const isSignFailure = (x: any): x is SignFailure =>
  !!x && typeof x.status === 'number' && typeof x.error === 'string'

interface ParsedSign {
  evaluationId: string
  blockNum: number
  key: string
  email: string
  password: string
  typedName: string
  signatureDataUrl: string
}

export function parseSignRequest(body: any): { data: ParsedSign } | SignFailure {
  const { evaluationId, block, email, password, typedName, signatureDataUrl } = body || {}
  if (!evaluationId || !block || !email || !password || !typedName?.trim()) {
    return { error: 'Missing required fields.', status: 400 }
  }
  const blockNum = Number(block)
  const key = SIGNATURE_KEY_BY_BLOCK[blockNum]
  if (!key) return { error: `Block ${block} is not a signature block.`, status: 400 }
  return {
    data: { evaluationId, blockNum, key, email, password, typedName: typedName.trim(), signatureDataUrl: signatureDataUrl || '' },
  }
}

export async function verifyCredentials(email: string, password: string): Promise<{ signerId: string } | SignFailure> {
  const verifier = createCredentialVerifierClient()
  const { data, error } = await verifier.auth.signInWithPassword({ email, password })
  if (error || !data?.user) return { error: 'Invalid credentials.', status: 401 }
  return { signerId: data.user.id }
}

export async function loadSignContext(
  admin: AdminClient, signerId: string, evaluationId: string
): Promise<{ signer: Profile; evaluation: Evaluation } | SignFailure> {
  const { data: signer } = await admin.from('profiles').select('*').eq('id', signerId).single()
  if (!signer) return { error: 'Signer profile not found.', status: 403 }
  const { data: evaluation } = await admin.from('evaluations').select('*').eq('id', evaluationId).single()
  if (!evaluation) return { error: 'Evaluation not found.', status: 404 }
  return { signer: signer as Profile, evaluation: evaluation as Evaluation }
}

export function authorizeSigner(signer: Profile, blockNum: number, evaluation: Evaluation): SignFailure | null {
  if (!canSignBlock(signer, blockNum, evaluation)) {
    return { error: `Your role (${signer.preferred_role}) is not permitted to sign Block ${blockNum}.`, status: 403 }
  }
  if (evaluation.status === 'archived' || evaluation.signature_locked) {
    return { error: 'This report is finalized and cannot be signed.', status: 409 }
  }
  return null
}

export async function applySignature(
  admin: AdminClient, evaluation: Evaluation, blockNum: number, key: string,
  typedName: string, signatureDataUrl: string, signerId: string, signerRole: string
): Promise<{ block_values: any } | SignFailure> {
  const today = new Date().toISOString().split('T')[0]
  const block_values = {
    ...(evaluation.block_values || {}),
    [key]: typedName,
    [`${key}_data`]: signatureDataUrl,
    [`${key}_date`]: today,
  }
  // The Reporting Senior signature (block 50) locks the report for editing.
  const lockPatch = blockNum === 50 ? { signature_locked: true, routing_stage: 'locked' } : {}
  const { error } = await admin
    .from('evaluations')
    .update({ block_values, updated_at: new Date().toISOString(), ...lockPatch })
    .eq('id', evaluation.id)
  if (error) return { error: error.message, status: 500 }

  await admin.from('audit_logs').insert([{
    evaluation_id: evaluation.id, user_id: signerId, action: 'SIGNATURE_APPLIED',
    details: { block: blockNum, signer_role: signerRole, typed_name: typedName },
  }])
  return { block_values }
}
