/**
 * E2E seed script — creates @franklyn.dev test users, commands row, and eval fixtures.
 * Usage: npm run db:seed [-- --reset]
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { buildValidEval, FORM_DEFINITION_ID } from '../tests/fixtures/validEval'

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const path = resolve(process.cwd(), file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
    }
  }
}

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.E2E_TEST_PASSWORD || 'E2eTest!2026'

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const reset = process.argv.includes('--reset')

const E2E_USERS = [
  { email: 'sailor@franklyn.dev', role: 'Sailor', firstName: 'JOHN', lastName: 'DOE', middleInitial: 'A', dodId: '1234567890', rank: 'PO2' },
  { email: 'rater@franklyn.dev', role: 'Rater', firstName: 'ALAN', lastName: 'RAY', middleInitial: 'M', dodId: '2345678901', rank: 'PO1' },
  { email: 'seniorrater@franklyn.dev', role: 'Senior Rater', firstName: 'BETTY', lastName: 'SMITH', middleInitial: 'L', dodId: '3456789012', rank: 'CPO' },
  { email: 'reportingsenior@franklyn.dev', role: 'Reporting Senior', firstName: 'CARL', lastName: 'JONES', middleInitial: 'R', dodId: '4567890123', rank: 'CDR' },
  { email: 'admin@franklyn.dev', role: 'Admin', firstName: 'APEX', lastName: 'ADMIN', middleInitial: 'X', dodId: '5678901234', rank: 'CAPT' },
] as const

const E2E_MEMBER_NAMES = ['DOE, JOHN A', 'DOE, JOHN A (RECYCLE)']

async function findUserByEmail(email: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
}

async function upsertUser(u: (typeof E2E_USERS)[number]) {
  const existing = await findUserByEmail(u.email)
  const meta = {
    first_name: u.firstName,
    last_name: u.lastName,
    middle_initial: u.middleInitial,
    dod_id: u.dodId,
    uic: '12345',
    navy_rank: u.rank,
    command: 'USS NEVERSAIL',
    preferred_role: u.role,
  }

  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { password, user_metadata: meta })
    await admin.from('profiles').update({
      first_name: u.firstName,
      last_name: u.lastName,
      middle_initial: u.middleInitial,
      dod_id: u.dodId,
      uic: '12345',
      navy_rank: u.rank,
      command: 'USS NEVERSAIL',
      preferred_role: u.role,
      assigned_roles: [u.role],
    }).eq('id', existing.id)
    console.log(`  updated ${u.email}`)
    return existing.id
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password,
    email_confirm: true,
    user_metadata: meta,
  })
  if (error) throw new Error(`createUser ${u.email}: ${error.message}`)
  console.log(`  created ${u.email}`)
  return data.user.id
}

async function seedCommands() {
  const { error } = await admin.from('commands').upsert({
    uic: '12345',
    command_name: 'USS NEVERSAIL',
    command_type: 'SHIP',
    region: 'ATLANTIC',
    active: true,
  })
  if (error) throw new Error(`commands upsert: ${error.message}`)
  console.log('  commands: USS NEVERSAIL (12345)')
}

async function deleteE2eEvals() {
  const { data } = await admin.from('evaluations').select('id').in('member_name', E2E_MEMBER_NAMES)
  if (!data?.length) return
  const ids = data.map((r) => r.id)
  await admin.from('audit_logs').delete().in('evaluation_id', ids)
  await admin.from('review_approvals').delete().in('evaluation_id', ids)
  await admin.from('evaluations').delete().in('id', ids)
  console.log(`  removed ${ids.length} existing E2E eval(s)`)
}

async function seedEvals(users: Record<string, string>) {
  const sailorId = users.sailor
  const raterId = users.rater

  const routingDraft = buildValidEval({
    created_by: sailorId,
    current_holder_id: sailorId,
    previous_holder_id: null,
    routing_stage: 'sailor',
    participants: [sailorId],
    member_name: 'DOE, JOHN A',
    form_definition_id: FORM_DEFINITION_ID,
  })

  const recycleDraft = buildValidEval({
    created_by: sailorId,
    current_holder_id: raterId,
    previous_holder_id: sailorId,
    routing_stage: 'rater',
    participants: [sailorId, raterId],
    member_name: 'DOE, JOHN A (RECYCLE)',
    form_definition_id: FORM_DEFINITION_ID,
  })

  const { data: inserted, error } = await admin.from('evaluations').insert([routingDraft, recycleDraft]).select('id, member_name')
  if (error) throw new Error(`evaluations insert: ${error.message}`)

  const routing = inserted!.find((e) => e.member_name === 'DOE, JOHN A')
  const recycle = inserted!.find((e) => e.member_name === 'DOE, JOHN A (RECYCLE)')
  if (!routing || !recycle) throw new Error('Failed to locate seeded eval IDs')

  const idsPath = resolve(process.cwd(), 'tests/fixtures/e2e-ids.json')
  writeFileSync(idsPath, JSON.stringify({
    users,
    evals: { routing: routing.id, recycle: recycle.id },
    password: process.env.E2E_TEST_PASSWORD || password,
    seededAt: new Date().toISOString(),
  }, null, 2))
  console.log(`  routing eval: ${routing.id}`)
  console.log(`  recycle eval: ${recycle.id}`)
  console.log(`  wrote ${idsPath}`)
}

async function main() {
  console.log('Seeding E2E data on Supabase cloud...')
  if (reset) await deleteE2eEvals()

  await seedCommands()

  console.log('Users:')
  const normalized: Record<string, string> = {}
  for (const u of E2E_USERS) {
    const id = await upsertUser(u)
    const key =
      u.role === 'Senior Rater' ? 'seniorRater'
      : u.role === 'Reporting Senior' ? 'reportingSenior'
      : u.role.toLowerCase()
    normalized[key] = id
  }

  console.log('Evaluations:')
  await seedEvals(normalized)
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
