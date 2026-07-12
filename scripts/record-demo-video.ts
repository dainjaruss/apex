import { chromium, Page, BrowserContext } from 'playwright'
import { resolve } from 'path'
import { existsSync, mkdirSync, renameSync, readFileSync } from 'fs'
import { spawn, ChildProcess, execSync } from 'child_process'
import http from 'http'

// Final capstone demonstration recorder (beat-based cut).
//
// Lesson from the Milestone 5 recording: long scenes drift out of sync with
// the narration and leave stretches of static screen. This cut splits the
// walkthrough into short "beats" - one visible action + a few sentences each -
// so the existing VO-driven trimming in build-kdenlive-project.py keeps
// picture and narration aligned automatically.
//
// Produces:
//   - 6 branded slides (intro, tech stack, not-completed, 3 reflection cards)
//   - 11 live application beats (incl. a split-screen routing handoff)
//   - 4 PiP overlay clips
// Narration lives in docs/final_video_script.md (~140 wpm).
//
// !! DATA MUTATION WARNING !!
// Beats 3a (route forward), 3b (recycle), 5a (signature), and 6a (finalize)
// change the seeded evaluations. Before a full re-record, reset the fixtures:
//   npm run db:seed-stress:reset

const BASE_URL = process.env.BASE_URL || 'http://localhost:3099'
const PASSWORD = 'NavyEval!2026'
const OUT_DIR = resolve(process.cwd(), 'artifacts/demo-videos')
const TMP_DIR = resolve(OUT_DIR, 'tmp')

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true })

function waitForServer(url: string, timeoutMs = 60000): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode) {
          resolve(true)
        } else {
          retry()
        }
      }).on('error', retry)
    }
    const retry = () => {
      if (Date.now() - startTime > timeoutMs) {
        resolve(false)
      } else {
        setTimeout(check, 1000)
      }
    }
    check()
  })
}

async function injectCursorHighlight(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('apex_consent_accepted', 'true')
    window.addEventListener('DOMContentLoaded', () => {
      const cursor = document.createElement('div')
      cursor.id = 'apex-demo-cursor'
      cursor.style.cssText = 'position:fixed;width:28px;height:28px;border-radius:50%;background:rgba(59,130,246,0.35);border:2.5px solid #3b82f6;pointer-events:none;z-index:999999;transition:transform 0.08s ease, left 0.05s linear, top 0.05s linear;transform:translate(-50%, -50%);box-shadow: 0 0 12px rgba(59,130,246,0.6);'
      document.body.appendChild(cursor)
      window.addEventListener('mousemove', (e) => {
        cursor.style.left = e.clientX + 'px'
        cursor.style.top = e.clientY + 'px'
      })
      window.addEventListener('mousedown', () => {
        cursor.style.transform = 'translate(-50%, -50%) scale(0.7)'
        cursor.style.background = 'rgba(239,68,68,0.5)'
        cursor.style.borderColor = '#ef4444'
      })
      window.addEventListener('mouseup', () => {
        cursor.style.transform = 'translate(-50%, -50%) scale(1)'
        cursor.style.background = 'rgba(59,130,246,0.35)'
        cursor.style.borderColor = '#3b82f6'
      })
    })
  })
}

// Fixed ribbon labelling which user a split-screen half is signed in as.
async function injectRoleRibbon(page: Page, label: string, color: string) {
  await page.addInitScript(({ label, color }) => {
    window.addEventListener('DOMContentLoaded', () => {
      const ribbon = document.createElement('div')
      ribbon.textContent = label
      ribbon.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:999998;text-align:center;padding:7px 0;font:700 15px 'Segoe UI',sans-serif;letter-spacing:3px;color:#fff;background:${color};box-shadow:0 2px 10px rgba(0,0,0,0.45);`
      document.body.appendChild(ribbon)
    })
  }, { label, color })
}

// Spotlight: dim the whole page except the target and pulse a gold outline
// around it. Recorded in-browser, so it stays sharp and perfectly synced.
async function spotlight(page: Page, selector: string, holdMs = 2800) {
  const target = page.locator(selector).first()
  if (!(await target.isVisible().catch(() => false))) return
  await target.scrollIntoViewIfNeeded().catch(() => {})
  const box = await target.boundingBox().catch(() => null)
  if (!box) return
  await page.evaluate(({ box }) => {
    const el = document.createElement('div')
    el.id = 'apex-spotlight'
    el.style.cssText =
      `position:fixed;left:${box.x - 10}px;top:${box.y - 10}px;` +
      `width:${box.width + 20}px;height:${box.height + 20}px;` +
      'z-index:999997;pointer-events:none;border:3px solid #f0b429;border-radius:10px;' +
      'box-shadow:0 0 0 9999px rgba(3,7,18,0.55), 0 0 24px rgba(240,180,41,0.9);' +
      'transition:opacity 0.4s ease;opacity:0;'
    document.body.appendChild(el)
    requestAnimationFrame(() => { el.style.opacity = '1' })
  }, { box })
  await page.waitForTimeout(holdMs)
  await page.evaluate(() => {
    const el = document.getElementById('apex-spotlight')
    if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 450) }
  })
  await page.waitForTimeout(600)
}

// Punch-in: smooth zoom toward the target region, hold, then ease back out.
// CSS transform at capture time = crisp text (a post-production zoom on
// 1080p footage would resample and blur).
async function punchIn(page: Page, selector: string, scale = 1.5, holdMs = 3000) {
  const target = page.locator(selector).first()
  if (!(await target.isVisible().catch(() => false))) return
  await target.scrollIntoViewIfNeeded().catch(() => {})
  const box = await target.boundingBox().catch(() => null)
  if (!box) return
  await page.evaluate(({ box, scale }) => {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const root = document.documentElement
    root.style.transition = 'transform 0.9s cubic-bezier(0.4, 0, 0.2, 1)'
    root.style.transformOrigin = `${cx}px ${cy}px`
    root.style.transform = `scale(${scale})`
  }, { box, scale })
  await page.waitForTimeout(900 + holdMs)
  await page.evaluate(() => { document.documentElement.style.transform = 'scale(1)' })
  await page.waitForTimeout(1100)
}

async function humanClick(page: Page, selector: string) {
  const locator = page.locator(selector).first()
  await locator.waitFor({ state: 'visible', timeout: 15000 })
  await locator.hover()
  await page.waitForTimeout(600)
  await locator.click()
  await page.waitForTimeout(800)
}

async function humanType(page: Page, selector: string, text: string) {
  const locator = page.locator(selector).first()
  await locator.waitFor({ state: 'visible', timeout: 15000 })
  await locator.hover()
  await page.waitForTimeout(400)
  await locator.click()
  await page.waitForTimeout(300)
  await locator.fill('')
  for (const char of text) {
    await locator.pressSequentially(char, { delay: 45 })
  }
  await page.waitForTimeout(600)
}

async function smoothScroll(page: Page, pixels: number, settleMs = 2000) {
  await page.evaluate((px) => window.scrollBy({ top: px, behavior: 'smooth' }), pixels)
  await page.waitForTimeout(settleMs)
}

// Pre-authenticate each demo user once (not recorded) so scenes can skip the
// repetitive login typing and spend their runtime on actual content.
const authStates: Record<string, any> = {}
async function warmupLogin(browser: any, email: string, attempt = 1) {
  console.log(`Warming up session: ${email} (attempt ${attempt})`)
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await page.addInitScript(() => localStorage.setItem('apex_consent_accepted', 'true'))
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500) // let React hydrate before interacting
    await page.fill('#login-email', email)
    await page.fill('#login-password', PASSWORD)
    await page.click('button:has-text("Sign In")')
    await page.waitForURL('**/dashboard', { timeout: 30000 })
    authStates[email] = await context.storageState()
    console.log(`   session captured: ${authStates[email].cookies?.length ?? 0} cookie(s)`)
  } catch (err) {
    if (attempt >= 2) throw err
    await context.close()
    return warmupLogin(browser, email, attempt + 1)
  }
  await context.close()
}

interface SceneOpts {
  cursor?: boolean
  asUser?: string
  // Pad the scene to at least this many seconds so narration always fits,
  // even when optional interactions get skipped.
  minSeconds?: number
}

// Optional CLI filter: `npm run demo:record -- scene_ overlay_` re-records
// only clips whose name contains one of the given substrings.
const nameFilter = process.argv.slice(2)
const wantScene = (name: string) =>
  nameFilter.length === 0 || nameFilter.some((s) => name.includes(s))

async function recordScene(
  browser: any,
  sceneName: string,
  action: (page: Page) => Promise<void>,
  opts: SceneOpts = {},
  attempt = 1
) {
  if (!wantScene(sceneName)) {
    console.log(`Skipping ${sceneName} (filtered)`)
    return
  }
  if (opts.asUser && !authStates[opts.asUser]) {
    console.error(`!! Skipping ${sceneName}: no warmed session for ${opts.asUser}`)
    return
  }
  console.log(`\n====================================================`)
  console.log(`RECORDING: ${sceneName}`)
  console.log(`====================================================`)
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: TMP_DIR,
      size: { width: 1920, height: 1080 },
    },
    ...(opts.asUser && authStates[opts.asUser]
      ? { storageState: authStates[opts.asUser] }
      : {}),
  })
  const page = await context.newPage()
  await page.addInitScript(() => localStorage.setItem('apex_consent_accepted', 'true'))
  if (opts.cursor !== false) await injectCursorHighlight(page)

  let retryWithFreshSession = false
  try {
    const started = Date.now()
    await action(page)
    console.log(`   [${sceneName}] final URL: ${page.url()}`)
    // Self-heal: an authed beat that ends on /login filmed a dead session.
    // Re-warm the user and re-record once instead of keeping the bad take.
    if (opts.asUser && page.url().includes('/login') && attempt === 1) {
      console.error(`!! ${sceneName} lost its session (ended on /login) - re-warming ${opts.asUser}`)
      retryWithFreshSession = true
    }
    if (opts.minSeconds) {
      const remaining = opts.minSeconds * 1000 - (Date.now() - started)
      if (remaining > 0) await page.waitForTimeout(remaining)
    }
    await page.waitForTimeout(2000) // End pause
  } catch (err) {
    console.error(`Error during ${sceneName}:`, err)
  } finally {
    // Supabase rotates refresh tokens: a later context reusing the warmup-era
    // snapshot gets the whole session revoked. Re-snapshot after every scene
    // so the next context for this user inherits the freshest tokens.
    const sceneUser = opts.asUser
    if (sceneUser) {
      authStates[sceneUser] = await context.storageState().catch(() => authStates[sceneUser])
    }
    const video = page.video()
    const videoPath = video ? await video.path() : null
    await page.close()
    await context.close()

    if (retryWithFreshSession) {
      // Bad take (dead session) - drop it, refresh the login, go again.
      delete authStates[opts.asUser!]
      await warmupLogin(browser, opts.asUser!)
      await recordScene(browser, sceneName, action, opts, attempt + 1)
    } else if (videoPath && existsSync(videoPath)) {
      const finalPath = resolve(OUT_DIR, `${sceneName}.webm`)
      renameSync(videoPath, finalPath)
      console.log(`-> Saved successfully: ${finalPath}`)
    } else {
      console.error(`-> Failed to save video for ${sceneName}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Split-screen recorder: two isolated sessions (own cookies/JWT) recorded
// simultaneously at 960x1080 each, then hstacked with ffmpeg into one plain
// 1920x1080 A-roll clip - no Kdenlive compositing changes required.
// ---------------------------------------------------------------------------

async function recordSplitScene(
  browser: any,
  sceneName: string,
  left: { user: string; label: string },
  right: { user: string; label: string },
  action: (leftPage: Page, rightPage: Page) => Promise<void>,
  minSeconds = 0
) {
  if (!wantScene(sceneName)) {
    console.log(`Skipping ${sceneName} (filtered)`)
    return
  }
  console.log(`\n====================================================`)
  console.log(`RECORDING (split-screen): ${sceneName}`)
  console.log(`====================================================`)

  const makeContext = (user: string): Promise<BrowserContext> =>
    browser.newContext({
      viewport: { width: 960, height: 1080 },
      recordVideo: { dir: TMP_DIR, size: { width: 960, height: 1080 } },
      ...(authStates[user] ? { storageState: authStates[user] } : {}),
    })

  // Create both contexts together so the two recordings start near-simultaneously.
  const [ctxL, ctxR] = await Promise.all([makeContext(left.user), makeContext(right.user)])
  const [pageL, pageR] = await Promise.all([ctxL.newPage(), ctxR.newPage()])
  await Promise.all([
    pageL.addInitScript(() => localStorage.setItem('apex_consent_accepted', 'true')),
    pageR.addInitScript(() => localStorage.setItem('apex_consent_accepted', 'true'))
  ])
  await injectCursorHighlight(pageL)
  await injectCursorHighlight(pageR)
  await injectRoleRibbon(pageL, left.label, '#1d4ed8')
  await injectRoleRibbon(pageR, right.label, '#b45309')

  try {
    const started = Date.now()
    await action(pageL, pageR)
    const remaining = minSeconds * 1000 - (Date.now() - started)
    if (remaining > 0) await pageL.waitForTimeout(remaining)
    await pageL.waitForTimeout(2000)
  } catch (err) {
    console.error(`Error during ${sceneName}:`, err)
  } finally {
    // Same token-rotation guard as recordScene, for both halves.
    authStates[left.user] = await ctxL.storageState().catch(() => authStates[left.user])
    authStates[right.user] = await ctxR.storageState().catch(() => authStates[right.user])
    const vidL = pageL.video()
    const vidR = pageR.video()
    const pathL = vidL ? await vidL.path() : null
    const pathR = vidR ? await vidR.path() : null
    await Promise.all([pageL.close(), pageR.close()])
    await Promise.all([ctxL.close(), ctxR.close()])

    if (pathL && pathR && existsSync(pathL) && existsSync(pathR)) {
      const finalPath = resolve(OUT_DIR, `${sceneName}.webm`)
      console.log('Stacking halves with ffmpeg...')
      execSync(
        `ffmpeg -y -i "${pathL}" -i "${pathR}" ` +
        `-filter_complex "[0:v][1:v]hstack=inputs=2:shortest=1[v]" -map "[v]" ` +
        `-c:v libvpx -b:v 6M -r 60 "${finalPath}"`,
        { stdio: 'pipe' }
      )
      console.log(`-> Saved successfully: ${finalPath}`)
    } else {
      console.error(`-> Failed to save split video for ${sceneName}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Narrative slides - branded full-screen cards recorded like any other scene.
// ---------------------------------------------------------------------------

function slideHTML(title: string, subtitle: string, items: string[], footer: string) {
  const bullets = items
    .map(
      (t, i) =>
        `<li style="animation-delay:${0.6 + i * 0.35}s">${t}</li>`
    )
    .join('\n')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      width:1920px; height:1080px; overflow:hidden;
      font-family:'Segoe UI', 'DejaVu Sans', sans-serif;
      background: radial-gradient(1200px 800px at 20% 10%, #16233f 0%, #0b1220 55%, #080d18 100%);
      color:#e8edf6; display:flex; flex-direction:column; padding:90px 120px;
    }
    .brand { display:flex; align-items:center; gap:18px; margin-bottom:70px;
      animation:fadein 0.8s ease both; }
    .chevrons { display:flex; flex-direction:column; gap:4px; }
    .chevrons span { display:block; width:34px; height:10px;
      clip-path:polygon(0 100%, 50% 0, 100% 100%, 50% 55%); }
    .brand .word { font-size:30px; font-weight:700; letter-spacing:6px; }
    .brand .sub { font-size:16px; letter-spacing:4px; color:#f0b429; font-weight:600; }
    h1 { font-size:64px; font-weight:800; line-height:1.15; max-width:1500px;
      animation:fadein 0.9s ease 0.15s both; }
    h2 { font-size:28px; font-weight:400; color:#9fb0ca; margin-top:22px;
      animation:fadein 0.9s ease 0.35s both; }
    ul { list-style:none; margin-top:60px; }
    li { font-size:31px; line-height:1.45; margin-bottom:26px; padding-left:52px;
      position:relative; color:#dbe4f2; max-width:1500px;
      animation:fadein 0.7s ease both; }
    li::before { content:'\\27A4'; position:absolute; left:0; top:2px; color:#f0b429; }
    .footer { margin-top:auto; display:flex; justify-content:space-between;
      color:#6d7f9e; font-size:20px; letter-spacing:1px;
      animation:fadein 1s ease 1.2s both; }
    @keyframes fadein { from {opacity:0; transform:translateY(14px);} to {opacity:1; transform:none;} }
  </style></head><body>
    <div class="brand">
      <div class="chevrons">
        <span style="background:#f0b429"></span>
        <span style="background:#e5484d"></span>
        <span style="background:#3b82f6"></span>
      </div>
      <div><div class="word">APEX</div><div class="sub">NAVAL EVAL</div></div>
    </div>
    <h1>${title}</h1>
    <h2>${subtitle}</h2>
    <ul>${bullets}</ul>
    <div class="footer"><span>${footer}</span><span>NAVPERS 1616/26 &middot; BUPERSINST 1610.10H</span></div>
  </body></html>`
}

// If a recorded narration exists for this slide, hold at least as long as
// the voiceover plus a 2s tail so the static card never ends mid-sentence.
function voiceoverSeconds(name: string): number | null {
  const wav = resolve(OUT_DIR, 'voiceover', `${name}.wav`)
  if (!existsSync(wav)) return null
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${wav}"`
    ).toString()
    return parseFloat(out)
  } catch {
    return null
  }
}

async function recordSlide(
  browser: any,
  name: string,
  holdSeconds: number,
  title: string,
  subtitle: string,
  items: string[],
  footer = 'CIS 5898 Capstone &middot; Final Project Demonstration &middot; Dain Franklyn'
) {
  const vo = voiceoverSeconds(name)
  const hold = vo ? Math.max(holdSeconds, vo + 2) : holdSeconds
  await recordScene(
    browser,
    name,
    async (page) => {
      await page.setContent(slideHTML(title, subtitle, items, footer), { waitUntil: 'load' })
      await page.waitForTimeout(hold * 1000)
    },
    { cursor: false }
  )
}

// ---------------------------------------------------------------------------

async function main() {
  console.log('====================================================')
  console.log('APEX FINAL DEMO RECORDER (beat-based 6-8 minute cut)')
  console.log('====================================================')
  console.log('NOTE: beats 3a/3b/5a/6a mutate seeded evals.')
  console.log('Run `npm run db:seed-stress:reset` before a full re-record.\n')

  let devServerProcess: ChildProcess | null = null
  const isUp = await waitForServer(BASE_URL, 3000)
  if (!isUp) {
    console.log(`Starting dev server on ${BASE_URL}...`)
    devServerProcess = spawn('npm', ['run', 'dev', '--', '-p', '3099'], {
      stdio: 'inherit',
      shell: true,
    })
    const ready = await waitForServer(BASE_URL, 60000)
    if (!ready) {
      if (devServerProcess) devServerProcess.kill()
      throw new Error('Dev server failed to start within 60s!')
    }
    console.log('Dev server ready!')
  }

  // Load eval summary fixture to get test evaluation IDs
  const summaryPath = resolve(process.cwd(), 'tests/fixtures/stress-evals-summary.json')
  let evals: any[] = []
  if (existsSync(summaryPath)) {
    const summaryData = JSON.parse(readFileSync(summaryPath, 'utf8'))
    evals = summaryData.evaluations || []
  } else {
    console.warn('Warning: stress-evals-summary.json not found. Using fallback IDs.')
  }

  const sailorEval = evals.find((e) => e.routing_stage === 'sailor') || evals[3] || { id: '' }
  // The split-screen route-forward beat routes the SAME eval the editor beats
  // used: each sailor-stage eval belongs to its own *.charlie account (RLS
  // hides the others), and the editor beats never save. Consequence: reseed
  // (npm run db:seed-stress:reset) before re-recording any of 2a-2c or 3a.
  const routeEval = sailorEval
  const raterEval = evals.find((e) => e.routing_stage === 'rater') || evals[2] || { id: '' }
  const coEval = evals.find((e) => e.routing_stage === 'reporting_senior') || evals[0] || { id: '' }
  // The finalize beat reuses coEval AFTER 5a locks it: /api/eval-finalize
  // requires signature_locked AND the report owner (the sailor) as caller.
  const exportEval = coEval

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
  })

  try {
    // Slides need no auth - only warm up sessions if app scenes will record
    const appClips = [
      'scene_1a_login_dashboard', 'scene_1b_register_email',
      'scene_2a_editor_tour', 'scene_2b_live_preview', 'scene_2c_validation_rules',
      'scene_3a_routing_split', 'scene_3b_recycle',
      'scene_4a_summary_groups', 'scene_5a_signing', 'scene_5b_audit_lock',
      'scene_6a_export_download',
      'overlay_1_block41_split', 'overlay_2_forced_dist_warning', 'overlay_3_audit_trail_sync',
    ]
    if (appClips.some(wantScene)) {
      await warmupLogin(browser, 'it1.charlie@franklyn.dev')
      await warmupLogin(browser, 'rater.it@franklyn.dev')
      await warmupLogin(browser, 'co.enterprise@franklyn.dev')
      await warmupLogin(browser, 'it1.sailor@franklyn.dev') // owner-finalize in 6a
    }

    // ---- SLIDE 1: Title & agenda ----
    await recordSlide(browser, 'slide_1_intro', 25,
      'APEX &mdash; Advanced Performance Evaluation eXchange',
      'CIS 5898 Capstone &middot; Final Project Demonstration',
      [
        'Full walkthrough of the completed application',
        'Technologies, tools, and frameworks used',
        'Planned features not completed &mdash; and why',
        'Personal reflection: skills gained, challenges, lessons learned',
      ])

    // ---- SPLASH 1a: Authentication & Role-Based Access ----
    await recordSlide(browser, 'splash_1a_login_auth', 4,
      'Authentication & Role-Based Access',
      'Section 1a &mdash; Security & Identity Management',
      [
        'Strict login credential validation and error feedback',
        'Role-Based Access Control (RBAC) determining UI capabilities',
        'Personalized dashboard cards tailored to active duty status',
      ])

    // ---- BEAT 1a: Login validation -> RBAC dashboard (~0:32) ----
    // Action-dense on purpose: a failed login with a visible error, then the
    // successful sign-in and a quick dashboard tour.
    await recordScene(browser, 'scene_1a_login_dashboard', async (page) => {
      await page.goto(`${BASE_URL}/login`)
      await page.waitForTimeout(1500)
      await humanType(page, '#login-email', 'it1.sailor@franklyn.dev')
      await humanType(page, '#login-password', 'WrongPassword!99')
      await humanClick(page, 'button:has-text("Sign In")')
      await page.waitForTimeout(2000) // auth error box renders
      await spotlight(page, 'text=Invalid login credentials', 2600)
      await humanType(page, '#login-password', PASSWORD)
      await humanClick(page, 'button:has-text("Sign In")')
      await page.waitForURL('**/dashboard', { timeout: 30000 })
      await page.waitForTimeout(2000)
      await smoothScroll(page, 350, 2500)
      const card = page.locator('text=View Report').first()
      if (await card.isVisible().catch(() => false)) {
        await card.hover()
      }
      await page.waitForTimeout(2000)
    }, { minSeconds: 35 })

    // ---- SPLASH 1b: User Registration & Verification ----
    await recordSlide(browser, 'splash_1b_registration', 4,
      'User Registration & Verification',
      'Section 1b &mdash; Account Onboarding',
      [
        'New user account creation with required profile metadata',
        'Domain validation and email verification gates',
        'Rate-limiting protections against automated enrollment',
      ])

    // ---- BEAT 1b: Registration + email confirmation screen (~0:16) ----
    await recordScene(browser, 'scene_1b_register_email', async (page) => {
      // Intercept Supabase signup call to prevent email rate-limiting errors during demo recording
      await page.route('**/auth/v1/signup**', async (route) => {
        const postData = JSON.parse(route.request().postData() || '{}')
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              user: {
                id: '11111111-2222-3333-4444-555555555555',
                aud: 'authenticated',
                role: 'authenticated',
                email: postData.email || 'demo.recruit@franklyn.dev',
                confirmation_sent_at: new Date().toISOString(),
                app_metadata: { provider: 'email', providers: ['email'] },
                user_metadata: postData.options?.data || {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              },
              session: null
            },
            error: null
          })
        })
      })

      await page.goto(`${BASE_URL}/register`)
      await page.waitForTimeout(1000)
      // Populate identity boilerplate quickly to keep overall runtime to ~16s
      await page.fill('#reg-first-name', 'DEMO')
      await page.fill('#reg-last-name', 'RECRUIT')
      await page.fill('#reg-mi', 'D')
      const uniqueDodId = Math.floor(1000000000 + Math.random() * 9000000000).toString()
      await page.fill('#reg-dod-id', uniqueDodId)
      const rank = page.locator('#reg-rank')
      if (await rank.isVisible().catch(() => false)) {
        const tag = await rank.evaluate((el) => el.tagName).catch(() => '')
        if (tag === 'SELECT') await rank.selectOption({ index: 1 }).catch(() => {})
        else await rank.fill('IT3').catch(() => {})
      }
      await page.fill('#reg-uic', '00241')
      await page.fill('#reg-command', 'USS NEVERSAIL')
      await page.waitForTimeout(600)
      // Human-type the key credentials being demonstrated
      await humanType(page, '#reg-email', `demo.recruit.${Date.now()}@franklyn.dev`)
      await humanType(page, '#reg-password', PASSWORD)
      await humanClick(page, 'button[type="submit"]')
      // The "verification link sent" confirmation screen
      await page.locator('text=verification link').first()
        .waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(1500)
      await spotlight(page, 'text=verification link', 3000)
    }, { minSeconds: 16 })

    // ---- SPLASH 2: Evaluation Editor & Real-Time Validation ----
    await recordSlide(browser, 'splash_2_editor_tour', 4,
      'Evaluation Editor & Real-Time Validation',
      'Section 2 &mdash; NAVPERS 1616/26 Report Drafting',
      [
        'Structured tour across Administrative Data, Performance Traits, and Comments',
        'Real-time Courier-pitch character wrapping and live preview',
        'Instant validation against official Navy BUPERSINST 1610.10H instructions',
      ])

    // ---- BEAT 2a: Editor tour - sections: admin data, traits, comments, recommendations (~0:20) ----
    if (sailorEval.id) {
      await recordScene(browser, 'scene_2a_editor_tour', async (page) => {
        await page.goto(`${BASE_URL}/evaluations/${sailorEval.id}/edit`)
        await page.waitForTimeout(1400)
        // 1. Administrative data section
        const adminStep = page.locator('text=Admin & Command Info').first()
        if (await adminStep.isVisible().catch(() => false)) {
          await adminStep.hover()
          await smoothScroll(page, 280, 1500)
        }
        // 2. Traits and performance grades section
        const traitsStep = page.locator('text=Performance Traits').first()
        if (await traitsStep.isVisible().catch(() => false)) {
          await traitsStep.click()
          await page.waitForTimeout(1000)
          await smoothScroll(page, 320, 1600)
        }
        // 3. Comments on performance section
        const narrativeStep = page.locator('text=Narrative & Comments').first()
        if (await narrativeStep.isVisible().catch(() => false)) {
          await narrativeStep.click()
          await page.waitForTimeout(1200)
          await smoothScroll(page, 180, 1200)
        }
        // 4. Recommendations section (Promotion Recommendation)
        const signaturesStep = page.locator('text=Signatures & RS Info').first()
        if (await signaturesStep.isVisible().catch(() => false)) {
          await signaturesStep.click()
          await page.waitForTimeout(1000)
          const promoRec = page.locator('text=Promotion Recommendation').first()
          if (await promoRec.isVisible().catch(() => false)) {
            await promoRec.scrollIntoViewIfNeeded()
            await page.waitForTimeout(400)
            await spotlight(page, 'text=Promotion Recommendation', 2800)
          } else {
            await smoothScroll(page, 350, 2000)
          }
        }
      }, { asUser: 'it1.charlie@franklyn.dev', minSeconds: 20 })

      // ---- BEAT 2b: Live preview typing + wrap (~0:16) ----
      await recordScene(browser, 'scene_2b_live_preview', async (page) => {
        await page.goto(`${BASE_URL}/evaluations/${sailorEval.id}/edit`)
        await page.waitForTimeout(2200)
        const narrativeStep = page.locator('text=Narrative & Comments').first()
        if (await narrativeStep.isVisible().catch(() => false)) {
          await narrativeStep.click()
          await page.waitForTimeout(1500)
        }
        const box = page.locator('textarea').first()
        if (await box.isVisible().catch(() => false)) {
          await box.click()
          await box.press('End')
          await box.pressSequentially(
            ' Led 12 Sailors through INSURV preparations with zero discrepancies.',
            { delay: 55 }
          )
          await punchIn(page, 'textarea', 1.45, 2800) // show pitch-exact wrapping up close
        }
        await page.waitForTimeout(1500)
      }, { asUser: 'it1.charlie@franklyn.dev', minSeconds: 16 })

      // ---- BEAT 2c: Validation engine - break it, verify, fix, re-verify (~0:32) ----
      await recordScene(browser, 'scene_2c_validation_rules', async (page) => {
        await page.goto(`${BASE_URL}/evaluations/${sailorEval.id}/edit`)
        await page.waitForTimeout(2500)
        const traitsStep = page.locator('text=Performance Traits').first()
        if (await traitsStep.isVisible().catch(() => false)) {
          await traitsStep.click()
          await page.waitForTimeout(1800)
        }
        // Drop the first trait to 1.0 - triggers the substantiation and
        // Block 45 cross-field rules against the seeded Promotable rec.
        const oneOh = page.getByRole('button', { name: '1.0', exact: true }).first()
        let broke = false
        if (await oneOh.isVisible().catch(() => false)) {
          await oneOh.hover(); await page.waitForTimeout(500)
          await oneOh.click(); broke = true
          await page.waitForTimeout(2200) // standard-verbiage panel expands
        }
        const verify = async (highlightViolations = false) => {
          await humanClick(page, 'button:has-text("Verify Rules")')
          await page.waitForTimeout(3000)
          const modal = page.locator('[role="dialog"], .modal').first()
          if (await modal.isVisible().catch(() => false)) {
            if (highlightViolations) await spotlight(page, '[role="dialog"], .modal', 3000)
            await modal.evaluate((el) => el.scrollBy({ top: 250, behavior: 'smooth' })).catch(() => {})
          }
          await page.waitForTimeout(2000)
          const closeBtn = page.locator('button:has-text("Close"), button:has-text("×")').first()
          if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click()
          await page.waitForTimeout(800)
        }
        await verify(true) // violations on screen, spotlighted
        if (broke) {
          await oneOh.click() // toggle 1.0 off -> trait back to ungraded
          await page.waitForTimeout(600)
          const fourOh = page.getByRole('button', { name: '4.0', exact: true }).first()
          if (await fourOh.isVisible().catch(() => false)) await fourOh.click()
          await page.waitForTimeout(1200)
          await verify() // clean pass
        }
      }, { asUser: 'it1.charlie@franklyn.dev', minSeconds: 32 })
    }

    // ---- SPLASH 3: Chain-of-Command Routing & Recycle ----
    await recordSlide(browser, 'splash_3_routing_chain', 4,
      'Chain-of-Command Routing & Recycle',
      'Section 3 &mdash; Custody Transfer & Review Workflow',
      [
        'Split-screen demonstration: Sailor routes report forward to Rater',
        'Database-enforced custody lock preventing concurrent drafting conflicts',
        'Recycle workflow with mandatory feedback loops and audit logging',
      ])

    // ---- BEAT 3a: SPLIT SCREEN - route forward, custody handoff (~0:34) ----
    // Left: Sailor holding a draft. Right: the Rater's dashboard. Two fully
    // isolated sessions (separate JWTs) recorded simultaneously.
    if (routeEval.id) {
      await recordSplitScene(
        browser,
        'scene_3a_routing_split',
        { user: 'it1.charlie@franklyn.dev', label: 'SIGNED IN AS: SAILOR' },
        { user: 'rater.it@franklyn.dev', label: 'SIGNED IN AS: RATER' },
        async (sailor, rater) => {
          await Promise.all([
            sailor.goto(`${BASE_URL}/evaluations/${routeEval.id}?tab=review`),
            rater.goto(`${BASE_URL}/dashboard`),
          ])
          await sailor.waitForTimeout(3500)
          await smoothScroll(sailor, 350, 2500)
          const routeBtn = sailor.locator('button:has-text("Route Forward")').first()
          if (await routeBtn.isVisible().catch(() => false)) {
            await routeBtn.hover()
            await sailor.waitForTimeout(1500)
            await routeBtn.click()
            await sailor.waitForTimeout(3500) // custody transition lands
          }
          // The Rater checks their queue - the report is now in their custody
          await rater.reload()
          await rater.waitForTimeout(3000)
          await smoothScroll(rater, 300, 2500)
          const newCard = rater.locator(`text=${(routeEval.member_name || '').split(',')[0]}`).first()
          if (await newCard.isVisible().catch(() => false)) {
            await newCard.hover()
            await rater.waitForTimeout(2000)
          }
        },
        34
      )
    }

    // ---- BEAT 3b: Recycle with mandatory feedback (~0:18) ----
    if (raterEval.id) {
      await recordScene(browser, 'scene_3b_recycle', async (page) => {
        await page.goto(`${BASE_URL}/evaluations/${raterEval.id}?tab=review`)
        await page.waitForTimeout(3000)
        await smoothScroll(page, 400, 2500)
        const commentBox = page.getByPlaceholder('What needs correcting?')
        if (await commentBox.isVisible().catch(() => false)) {
          await humanType(page, 'textarea[placeholder*="correcting"]', 'Please quantify the impact in bullet 2.')
          await page.waitForTimeout(1200)
          const recycleBtn = page.locator('button:has-text("Recycle")').first()
          if (await recycleBtn.isVisible().catch(() => false)) {
            await recycleBtn.click()
            await page.waitForTimeout(3000) // custody moves back; history updates
          }
        }
        await smoothScroll(page, 350, 2500)
      }, { asUser: 'rater.it@franklyn.dev', minSeconds: 18 })
    }

    // ---- SPLASH 4: Summary Groups & Trait Averages ----
    await recordSlide(browser, 'splash_4_summary_groups', 4,
      'Summary Groups & Trait Averages',
      'Section 4 &mdash; Reporting Senior Oversight & Quota Tracking',
      [
        'Grouping evaluations by paygrade and promotion status',
        'Dynamic computation of pooled Trait Average across all subordinates',
        'Real-time forced distribution tracking for Early Promote (EP) and Must Promote (MP)',
      ])

    // ---- BEAT 4a: Summary groups + forced distribution (~0:28) ----
    await recordScene(browser, 'scene_4a_summary_groups', async (page) => {
      await page.goto(`${BASE_URL}/summary-groups`)
      await page.waitForTimeout(3000)
      await smoothScroll(page, 350, 2500)
      const expandBtn = page.locator('button:has-text("View evaluations in this group")').first()
      if (await expandBtn.isVisible().catch(() => false)) {
        await humanClick(page, 'button:has-text("View evaluations in this group")')
        await page.waitForTimeout(3000)
      }
      const limitsPill = page.locator('text=WITHIN LIMITS').first()
      if (await limitsPill.isVisible().catch(() => false)) {
        await limitsPill.hover()
        await punchIn(page, 'text=WITHIN LIMITS', 1.6, 2800) // quota tracker up close
      }
      await smoothScroll(page, 400, 2500)
    }, { asUser: 'co.enterprise@franklyn.dev', minSeconds: 28 })

    // ---- SPLASH 5: Digital Signatures & Audit Trail ----
    await recordSlide(browser, 'splash_5_signing_audit', 4,
      'Digital Signatures & Audit Trail',
      'Section 5 &mdash; Cryptographic Signing & Verification',
      [
        'Canvas signature capture and PIN/password re-authentication for Block 50',
        'Immediate document locking upon signature application',
        'Immutable, timestamped audit log tracking every report state transition',
      ])

    // ---- BEAT 5a: Credential-verified signing, for real (~0:28) ----
    if (coEval.id) {
      await recordScene(browser, 'scene_5a_signing', async (page) => {
        await page.goto(`${BASE_URL}/evaluations/${coEval.id}?tab=details`)
        await page.waitForTimeout(3000)
        await smoothScroll(page, 900, 2500)
        await smoothScroll(page, 600, 2000)
        // "✍ Sign" exactly - a bare has-text("Sign") matches the sidebar's
        // Sign Out button first and logs the user out mid-recording. Scope to
        // the Block 50 row: that signature sets signature_locked, which the
        // audit beat and the finalize beat both depend on.
        const signBtn = page
          .locator('div:has(> button:has-text("✍ Sign")):has-text("50:")')
          .locator('button:has-text("✍ Sign")')
          .first()
        await signBtn.scrollIntoViewIfNeeded().catch(() => {})
        await page.waitForTimeout(1200)
        if (await signBtn.isVisible().catch(() => false)) {
          await signBtn.click()
          await page.waitForTimeout(1500)
          const modal = page.locator('input[placeholder="DOE, JOHN A"]').first()
          if (await modal.isVisible().catch(() => false)) {
            await humanType(page, 'input[placeholder="DOE, JOHN A"]', 'ENTERPRISE, C O')
            // Draw a squiggle on the signature canvas
            const canvas = page.locator('canvas').first()
            const box = await canvas.boundingBox().catch(() => null)
            if (box) {
              const cx = box.x + 30, cy = box.y + box.height / 2
              await page.mouse.move(cx, cy)
              await page.mouse.down()
              for (let i = 1; i <= 12; i++) {
                await page.mouse.move(cx + i * (box.width - 60) / 12,
                  cy + Math.sin(i * 1.1) * 18, { steps: 4 })
              }
              await page.mouse.up()
              await page.waitForTimeout(800)
            }
            await humanType(page, 'input[placeholder="you@navy.mil"]', 'co.enterprise@franklyn.dev')
            await humanType(page, 'input[type="password"]', PASSWORD)
            const consent = page.locator('input[type="checkbox"]').first()
            if (await consent.isVisible().catch(() => false)) await consent.check()
            await page.waitForTimeout(800)
            await humanClick(page, 'button:has-text("Sign & Certify")')
            await page.waitForTimeout(3500) // server-side verification + apply
          }
        }
      }, { asUser: 'co.enterprise@franklyn.dev', minSeconds: 28 })

      // ---- BEAT 5b: Audit trail + locked report (~0:15) ----
      await recordScene(browser, 'scene_5b_audit_lock', async (page) => {
        await page.goto(`${BASE_URL}/evaluations/${coEval.id}?tab=audit`)
        await page.waitForTimeout(3500)
        // The freshest entry is the signature we just applied in beat 5a
        await spotlight(page, 'text=SIGNATURE', 2800)
        await smoothScroll(page, 350, 2500)
        await smoothScroll(page, 350, 2000)
      }, { asUser: 'co.enterprise@franklyn.dev', minSeconds: 15 })
    }

    // ---- SPLASH 6: Official PDF Export & Finalization ----
    await recordSlide(browser, 'splash_6_export', 4,
      'Official PDF Export & Finalization',
      'Section 6 &mdash; Document Generation',
      [
        'Real-time validation check ensuring zero missing fields or conflicts',
        'High-fidelity overlay generation onto the official NAVPERS 1616/26 form',
        'Reporting senior download and record finalization',
      ])

    // ---- BEAT 6a: Export portal - render, download, finalize (~0:28) ----
    // Needs a headed browser (PDF iframe is blank headless): HEADLESS=false + Xvfb.
    if (exportEval.id) {
      await recordScene(browser, 'scene_6a_export_download', async (page) => {
        await page.goto(`${BASE_URL}/evaluations/${exportEval.id}/export`)
        await page.waitForTimeout(8000) // validation checks + overlay PDF render
        await page.mouse.move(960, 650, { steps: 30 })
        await punchIn(page, 'iframe', 1.4, 3000) // character-for-character fidelity up close
        for (let i = 0; i < 4; i++) {
          await page.mouse.wheel(0, 380)
          await page.waitForTimeout(1800)
        }
        const dl = page.locator('button:has-text("Download")').first()
        if (await dl.isVisible().catch(() => false)) {
          const dlPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null)
          await humanClick(page, 'button:has-text("Download")')
          await dlPromise
          await page.waitForTimeout(1500)
        }
        const fin = page.locator('button:has-text("Finalize")').first()
        if (await fin.isVisible().catch(() => false)) {
          await fin.scrollIntoViewIfNeeded().catch(() => {})
          await fin.hover()
          await page.waitForTimeout(1200)
          await fin.click()
          await page.waitForURL('**/dashboard', { timeout: 20000 }).catch(() => {})
          await page.waitForTimeout(2500)
        }
        // Owner (sailor) finalizes their own locked report - /api/eval-finalize
        // rejects anyone else, including the CO.
      }, { asUser: 'it1.sailor@franklyn.dev', minSeconds: 28 })
    }

    // ---- SLIDE 2: Technologies & architecture ----
    await recordSlide(browser, 'slide_2_tech', 28,
      'Technologies &amp; Architecture',
      'Design principle: never trust the browser &mdash; every rule is enforced twice',
      [
        'Next.js 14 &middot; React 18 &middot; TypeScript &mdash; App Router front end',
        'Supabase &mdash; Postgres, Auth, and Row-Level Security',
        'Zod schemas + a 329-line cross-field validation engine',
        'pdf-lib + Courier Prime &mdash; overlay onto the official NAVPERS blank',
        '158 Vitest unit/integration tests + 3 Playwright E2E specs',
        'Deployed to production on Vercel &mdash; apex-navy-eval.vercel.app',
      ])

    // ---- SLIDE 3: Planned but not completed ----
    await recordSlide(browser, 'slide_3_incomplete', 28,
      'Planned but Not Completed',
      'Deliberate scope decisions &mdash; and what each would take',
      [
        'CI pipeline for the E2E suite &mdash; runs locally against a seeded database today',
        'Summary-group breakout by UIC &mdash; schema-ready, not required for target paygrades',
        'CHIEFEVAL / FITREP report types &mdash; same architecture, different rule sets',
      ])

    // ---- SLIDE 4: Reflection - what I gained ----
    await recordSlide(browser, 'slide_4_reflection_skills', 92,
      'Personal Reflection &mdash; What I Gained',
      'Technical, problem-solving, and project-management growth',
      [
        'Full-stack ownership on a strict timeline: schema, security policies, API, and UI as one system',
        'Access control lives in the database, not just the UI &mdash; a lesson now applied to my other projects',
        'Building from primary sources: official Navy instructions &rarr; business rules &rarr; code',
        'Real project management: weekly milestones, with tests written alongside each feature as the barometer',
      ])

    // ---- SLIDE 5: Reflection - biggest challenges ----
    await recordSlide(browser, 'slide_5_reflection_challenges', 65,
      'Personal Reflection &mdash; Biggest Challenges',
      'Design and implementation obstacles, and how each was addressed',
      [
        'Creator-only security policies broke chain-of-command routing &rarr; custody-based RLS redesign across every layer',
        'Understanding what should happen &ne; knowing how to implement it',
        'No true fillable PDF of the official form exists &mdash; XFA limitations forced the overlay architecture',
        'Embedding data at measured coordinates: the right call for consistency and accuracy',
      ])

    // ---- SLIDE 6: Reflection - do differently & close ----
    await recordSlide(browser, 'slide_6_close', 40,
      'What I Would Do Differently',
      'Lessons for the next project',
      [
        'Design the custody model and security policies first &mdash; never retrofit them',
        'Implement testing and continuous integration from week one',
        'Research document formats (PDF vs XFA) and decide the path before writing code',
        'APEX: the Navy evaluation lifecycle digitized end to end &mdash; an artifact worthy of a Sailor’s record',
      ])

    // ---- PiP OVERLAYS (login-free b-roll, ~15s each) ----
    if (sailorEval.id) {
      await recordScene(browser, 'overlay_1_block41_split', async (page) => {
        await page.goto(`${BASE_URL}/evaluations/${sailorEval.id}?tab=preview`)
        await page.waitForTimeout(6000)
        await smoothScroll(page, 500, 4000)
        await page.waitForTimeout(3000)
      }, { asUser: 'it1.charlie@franklyn.dev' })
    }

    await recordScene(browser, 'overlay_2_forced_dist_warning', async (page) => {
      await page.goto(`${BASE_URL}/summary-groups`)
      await page.waitForTimeout(3000)
      const expandBtn = page.locator('button:has-text("View evaluations in this group")').first()
      if (await expandBtn.isVisible().catch(() => false)) {
        await expandBtn.click()
        await page.waitForTimeout(5000)
      }
      await smoothScroll(page, 300, 4000)
    }, { asUser: 'co.enterprise@franklyn.dev' })

    if (coEval.id) {
      await recordScene(browser, 'overlay_3_audit_trail_sync', async (page) => {
        await page.goto(`${BASE_URL}/evaluations/${coEval.id}?tab=audit`)
        await page.waitForTimeout(5000)
        await smoothScroll(page, 300, 4000)
        await page.waitForTimeout(3000)
      }, { asUser: 'co.enterprise@franklyn.dev' })
    }

    // ---- OVERLAY 4: validation rules card (PiP over beat 2c) ----
    // Designed at 1080p with large type so it stays readable at 45% PiP
    // scale. Rule wording verified against lib/bupersGuidelines.json.
    await recordScene(browser, 'overlay_4_validation_rules', async (page) => {
      const rules = [
        ['Blocks 10–13', 'Special (13) cannot combine with any other occasion'],
        ['Blocks 43/44', 'Narratives wrap exactly at pitch width — 90 chars × 18 lines'],
        ['Block 43', 'Substantiate any 1.0 mark, three or more 2.0s, or a 2.0 in EO'],
        ['Blocks 33–39', 'Any 1.0 or 5.0 trait grade requires Block 43 comments'],
        ['Block 45', 'No Promotable-or-higher recommendation with any 1.0 trait'],
      ]
      const lis = rules.map(([blk, txt], i) =>
        `<li style="animation-delay:${0.4 + i * 0.6}s"><b>${blk}</b><span>${txt}</span></li>`).join('')
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { width:1920px; height:1080px; overflow:hidden;
          font-family:'Segoe UI','DejaVu Sans',sans-serif; color:#e8edf6;
          background:linear-gradient(150deg,#16233f 0%,#0b1220 60%,#080d18 100%);
          border:6px solid #f0b429; display:flex; flex-direction:column; padding:70px 80px; }
        h1 { font-size:58px; font-weight:800; color:#f0b429; }
        h2 { font-size:34px; font-weight:400; color:#9fb0ca; margin:14px 0 40px; }
        ul { list-style:none; }
        li { font-size:44px; line-height:1.3; margin-bottom:34px; padding-left:56px;
          position:relative; animation:fadein 0.6s ease both; }
        li::before { content:'\\2713'; position:absolute; left:0; color:#1cdc9a; font-weight:800; }
        li b { color:#7cc0ff; margin-right:18px; }
        li span { color:#dbe4f2; }
        .footer { margin-top:auto; font-size:30px; color:#6d7f9e; }
        @keyframes fadein { from {opacity:0; transform:translateY(12px);} to {opacity:1; transform:none;} }
      </style></head><body>
        <h1>Validation Engine</h1>
        <h2>Cross-field checks from BUPERSINST 1610.10H — examples</h2>
        <ul>${lis}</ul>
        <div class="footer">329 lines of cross-field logic · runs on every “Verify Rules” click</div>
      </body></html>`, { waitUntil: 'load' })
      await page.waitForTimeout(10500)
    }, { cursor: false })

    console.log('\n====================================================')
    console.log('ALL FINAL-DEMO CLIPS RECORDED!')
    console.log(`Saved to: ${OUT_DIR}`)
    console.log('Remember: re-seed before re-recording mutating beats.')
    console.log('====================================================')
  } finally {
    await browser.close()
    if (devServerProcess) {
      console.log('Shutting down dev server...')
      devServerProcess.kill()
    }
  }
}

main().catch((err) => {
  console.error('Fatal error during recording:', err)
  process.exit(1)
})
