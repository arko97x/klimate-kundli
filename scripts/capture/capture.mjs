#!/usr/bin/env node
/**
 * Documentation capture — static screenshots + CDP screencast recordings.
 * See https://www.arccc.co/words/screen-capture-pipeline/
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, 'web/public/documentation')
const V02_FIXTURE = path.join(__dirname, 'fixtures/v0-2-kundli.json')

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173'
const V02_WEB_URL = process.env.V02_WEB_URL ?? 'http://localhost:5174'
const V031_URL = process.env.V031_URL ?? 'http://localhost:5175'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

async function screenshot(page, filePath, opts = {}) {
  await ensureDir(path.dirname(filePath))
  await page.screenshot({ path: filePath, type: 'png', ...opts })
  console.log(`  wrote ${path.relative(ROOT, filePath)}`)
}

/** Unclamp nested scroll containers so fullPage captures the entire result. */
async function expandScrollContainers(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      const style = getComputedStyle(el)
      if (['auto', 'scroll', 'hidden'].includes(style.overflowY)) {
        el.style.overflowY = 'visible'
      }
      if (['auto', 'scroll', 'hidden'].includes(style.overflow)) {
        el.style.overflow = 'visible'
      }
      if (style.maxHeight && style.maxHeight !== 'none') {
        el.style.maxHeight = 'none'
      }
      if (style.height.includes('dvh') || el.classList.contains('lg:h-dvh')) {
        el.style.height = 'auto'
      }
    }
    document.documentElement.style.height = 'auto'
    document.body.style.height = 'auto'
  })
  await sleep(300)
}

async function smoothScroll(page, targetY, durationMs) {
  await page.evaluate(
    (target, dur) =>
      new Promise((resolve) => {
        const start = window.scrollY
        const distance = target - start
        const startTime = performance.now()

        function easeInOutCubic(t) {
          return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
        }

        function step(now) {
          const progress = Math.min((now - startTime) / dur, 1)
          window.scrollTo(0, start + distance * easeInOutCubic(progress))
          if (progress < 1) requestAnimationFrame(step)
          else resolve(undefined)
        }

        requestAnimationFrame(step)
      }),
    targetY,
    durationMs,
  )
}

function startScreencast(client, framesDir) {
  let frameIndex = 0
  let ackQueue = Promise.resolve()

  client.on('Page.screencastFrame', (event) => {
    ackQueue = ackQueue.then(async () => {
      const filename = path.join(framesDir, `frame-${String(frameIndex).padStart(5, '0')}.png`)
      fs.writeFileSync(filename, Buffer.from(event.data, 'base64'))
      frameIndex++
      await client.send('Page.screencastFrameAck', { sessionId: event.sessionId })
    })
  })

  return {
    frameCount: () => frameIndex,
    drain: () => ackQueue,
  }
}

async function encodeVideo(framesDir, output, width, height, frameCount) {
  const frames = fs.readdirSync(framesDir).filter((f) => f.startsWith('frame-'))
  if (frames.length === 0) {
    throw new Error('no screencast frames captured')
  }

  // CDP only emits frames on compositor updates — stretch sparse captures to ~6s
  const targetSeconds = 6
  const framerate = Math.max(8, Math.min(24, frameCount / targetSeconds))

  await ensureDir(path.dirname(output))
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'ffmpeg',
      [
        '-y',
        '-framerate',
        String(framerate),
        '-i',
        path.join(framesDir, 'frame-%05d.png'),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        '18',
        '-preset',
        'slow',
        '-vf',
        `scale=${width}:${height}:flags=lanczos`,
        '-movflags',
        '+faststart',
        output,
      ],
      { stdio: 'inherit' },
    )
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))))
  })
}

async function selectCity(page, query, selector = '#birth-city') {
  const cityInput = await page.waitForSelector(selector)
  await cityInput.click({ clickCount: 3 })
  await cityInput.type(query, { delay: 35 })
  await sleep(700)
  const option = await page.waitForSelector('[role="option"]', { timeout: 12_000 }).catch(() => null)
  if (option) await option.click()
}

async function dragSliderThumb(page, rowIndex, thumbIndex, targetYear, birthYear, latestYear) {
  const thumbs = await page.$$('[data-slot="slider-thumb"]')
  const thumb = thumbs[rowIndex * 2 + thumbIndex]
  if (!thumb) {
    return
  }

  const sliders = await page.$$('[data-slot="slider"]')
  const slider = sliders[rowIndex]
  if (!slider) {
    return
  }

  const sliderBox = await slider.boundingBox()
  const thumbBox = await thumb.boundingBox()
  if (!sliderBox || !thumbBox) {
    return
  }

  const pct = (targetYear - birthYear) / (latestYear - birthYear)
  const targetX = sliderBox.x + sliderBox.width * Math.max(0, Math.min(1, pct))
  const y = thumbBox.y + thumbBox.height / 2

  await page.mouse.move(thumbBox.x + thumbBox.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(targetX, y, { steps: 12 })
  await page.mouse.up()
  await sleep(400)
}

async function addLivedCity(page, cityQuery) {
  await page.click('[aria-label="Add another city"]')
  await sleep(400)
  const inputs = await page.$$('input[placeholder="Search city"]')
  const input = inputs[inputs.length - 1]
  if (!input) {
    return
  }
  await input.click()
  await input.type(cityQuery, { delay: 35 })
  await sleep(700)
  const option = await page.waitForSelector('[role="option"]', { timeout: 12_000 }).catch(() => null)
  if (option) await option.click()
  await sleep(300)
}

async function generateKundliResult(page) {
  const generateButton = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => /generate/i.test(b.textContent ?? '')),
  )
  const genEl = generateButton.asElement()
  if (!genEl) {
    throw new Error('generate button not found')
  }
  await genEl.click()
  await page.waitForSelector('svg[role="img"]', { timeout: 90_000 })
  await sleep(1500)
  await expandScrollContainers(page)
}

const V033_SCENARIOS = [
  {
    slug: 'delhi-1988-mumbai',
    birthCity: 'Delhi',
    birthYear: 1988,
    splits: [{ rowIndex: 0, endYear: 2014 }],
    extraCities: ['Mumbai'],
  },
  {
    slug: 'mumbai-1995-bengaluru',
    birthCity: 'Mumbai',
    birthYear: 1995,
    splits: [{ rowIndex: 0, endYear: 2008 }],
    extraCities: ['Bengaluru'],
  },
  {
    slug: 'chennai-1970-delhi-kolkata',
    birthCity: 'Chennai',
    birthYear: 1970,
    splits: [
      { rowIndex: 0, endYear: 1992 },
      { rowIndex: 1, endYear: 2005 },
    ],
    extraCities: ['Delhi', 'Kolkata'],
  },
]

async function runV033Scenario(page, scenario, latestYear) {
  await page.goto(`${WEB_URL}?birthYear=${scenario.birthYear}`, {
    waitUntil: 'networkidle0',
    timeout: 30_000,
  })
  await page.waitForSelector('h1', { timeout: 10_000 })

  await selectCity(page, scenario.birthCity)
  await page.click('button[aria-label="Continue"]')
  await sleep(600)

  for (let i = 0; i < scenario.extraCities.length; i += 1) {
    const split = scenario.splits[i]
    if (split) {
      await dragSliderThumb(
        page,
        split.rowIndex,
        1,
        split.endYear,
        scenario.birthYear,
        latestYear,
      )
    }
    await addLivedCity(page, scenario.extraCities[i])
  }

  await generateKundliResult(page)

  await page.evaluate(() => {
    const heading = [...document.querySelectorAll('p')].find(
      (p) =>
        p.textContent?.includes('rings vs your parents') ||
        p.textContent?.includes('Every ring is a year'),
    )
    heading?.scrollIntoView({ block: 'start', behavior: 'instant' })
    window.scrollBy(0, -24)
  })
  await sleep(400)
}

async function captureV033(browser) {
  console.log('\nv0.3.3 — generational emissions rings')
  const latestYear = new Date().getUTCFullYear() - 1

  for (const scenario of V033_SCENARIOS) {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 })
    try {
      console.log(`  scenario ${scenario.slug}`)
      await runV033Scenario(page, scenario, latestYear)
      await screenshot(page, path.join(OUT, `v0-3-3/${scenario.slug}.png`), { fullPage: true })
    } catch (err) {
      console.log(`  failed ${scenario.slug} — ${err.message}`)
    }
    await page.close()
  }
}

async function selectDelhi(page) {
  const cityInput = await page.waitForSelector('#birth-city')
  await cityInput.click({ clickCount: 3 })
  await cityInput.type('Delhi', { delay: 35 })
  await sleep(700)
  const option = await page.waitForSelector('[role="option"]', { timeout: 12_000 }).catch(() => null)
  if (option) await option.click()
}

async function captureV032(browser) {
  console.log('\nv0.3.2 — current wizard')
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })

  await page.goto(WEB_URL, { waitUntil: 'networkidle0', timeout: 30_000 })
  await page.waitForSelector('h1', { timeout: 10_000 })
  await screenshot(page, path.join(OUT, 'v0-3-2/birth-step.png'))

  await selectDelhi(page)
  await page.click('button[aria-label="Continue"]')
  await sleep(500)
  await expandScrollContainers(page)
  await screenshot(page, path.join(OUT, 'v0-3-2/lived-cities-step.png'), { fullPage: true })

  const generateButton = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => /generate/i.test(b.textContent ?? '')),
  )
  const genEl = generateButton.asElement()
  if (!genEl) {
    console.log('  skipped chart + video (generate button not found)')
    await page.close()
    return
  }

  await genEl.click()
  await page.waitForSelector('svg[role="img"]', { timeout: 60_000 })
  await sleep(1200)
  await expandScrollContainers(page)
  await screenshot(page, path.join(OUT, 'v0-3-2/chart-result.png'), { fullPage: true })

  await page.close()

  // Fresh page — record wizard flow while screencast runs
  console.log('  recording wizard-flow.mp4 …')
  const videoPage = await browser.newPage()
  const width = 1280
  const height = 720
  const framesDir = path.join(ROOT, '.capture-frames')
  fs.mkdirSync(framesDir, { recursive: true })
  for (const f of fs.readdirSync(framesDir)) {
    if (f.startsWith('frame-')) fs.unlinkSync(path.join(framesDir, f))
  }

  await videoPage.setViewport({ width, height, deviceScaleFactor: 2 })
  const client = await videoPage.createCDPSession()
  const screencast = startScreencast(client, framesDir)

  await client.send('Page.startScreencast', {
    format: 'png',
    quality: 100,
    maxWidth: width * 2,
    maxHeight: height * 2,
    everyNthFrame: 1,
  })

  await videoPage.goto(WEB_URL, { waitUntil: 'networkidle0', timeout: 30_000 })
  await sleep(2500)

  await selectDelhi(videoPage)
  await sleep(2000)
  await videoPage.click('button[aria-label="Continue"]')
  await sleep(2500)

  const genBtn = await videoPage.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => /generate/i.test(b.textContent ?? '')),
  )
  const gen = genBtn.asElement()
  if (gen) {
    await gen.click()
    await videoPage.waitForSelector('svg[role="img"]', { timeout: 60_000 }).catch(() => null)
    await sleep(3500)
    await smoothScroll(videoPage, 1400, 2500)
    await sleep(2000)
    await smoothScroll(videoPage, 2800, 2500)
    await sleep(2000)
    await smoothScroll(videoPage, 0, 2000)
    await sleep(1500)
  }

  await sleep(500)
  await client.send('Page.stopScreencast')
  await screencast.drain()

  const output = path.join(OUT, 'v0-3-2/wizard-flow.mp4')
  const count = screencast.frameCount()
  await encodeVideo(framesDir, output, width, height, count)
  fs.rmSync(framesDir, { recursive: true, force: true })
  console.log(`  wrote ${path.relative(ROOT, output)} (${count} frames)`)

  await videoPage.close()
}

async function captureV031(browser) {
  console.log('\nv0.3.1 — dummy placeholder')
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 })
  try {
    await page.goto(V031_URL, { waitUntil: 'networkidle0', timeout: 8_000 })
    await screenshot(page, path.join(OUT, 'v0-3-1/dummy-ui.png'), { fullPage: true })
  } catch {
    console.log('  skipped — serve commit 1ce7fd8 web on port 5175')
  }
  await page.close()
}

function mockV02Routes(page) {
  const fixture = fs.readFileSync(V02_FIXTURE, 'utf8')
  const places = JSON.stringify({
    results: [
      {
        id: 1,
        slug: 'delhi-in',
        name: 'New Delhi',
        country: 'India',
        countryCode: 'IN',
        admin1: 'Delhi',
        lat: 28.6139,
        lon: 77.209,
        population: 32_000_000,
        tier: 1,
        rank: 1,
      },
    ],
  })

  page.on('request', (req) => {
    const url = req.url()
    if (url.includes('/api/kundli') && req.method() === 'POST') {
      req.respond({ status: 200, contentType: 'application/json', body: fixture })
      return
    }
    if (url.includes('/api/places?q=')) {
      req.respond({ status: 200, contentType: 'application/json', body: places })
      return
    }
    req.continue()
  })
}

async function captureV02(browser) {
  console.log(`\nv0.2 — ${V02_WEB_URL}`)
  const page = await browser.newPage()
  await page.setRequestInterception(true)
  mockV02Routes(page)
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 })

  try {
    await page.goto(V02_WEB_URL, { waitUntil: 'networkidle0', timeout: 20_000 })
    await sleep(800)
    await screenshot(page, path.join(OUT, 'v0-2/form.png'), { fullPage: true })

    await page.click('#birth-place')
    await page.waitForSelector('input[placeholder="Type a city name…"]')
    await page.type('input[placeholder="Type a city name…"]', 'Delhi', { delay: 40 })
    await sleep(600)
    await page.waitForSelector('[cmdk-item]:not([data-disabled="true"])')
    await page.click('[cmdk-item]:not([data-disabled="true"])')
    await sleep(300)

    await page.evaluate(() => {
      const input = document.querySelector('#birth-date')
      if (!input) return
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, '1990-06-15')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await sleep(200)

    await page.click('button[type="submit"]')
    await page.waitForSelector('section[aria-label="Twelve houses"]', { timeout: 15_000 })
    await sleep(1200)
    await screenshot(page, path.join(OUT, 'v0-2/kundli-grid.png'), { fullPage: true })
  } catch (err) {
    console.log(`  skipped grid — ${err.message}`)
    const debugPath = path.join(OUT, 'v0-2/_debug-submit-failed.png')
    await screenshot(page, debugPath, { fullPage: true }).catch(() => {})
  }

  await page.close()
}

async function main() {
  const only = process.argv.includes('--only')
    ? process.argv[process.argv.indexOf('--only') + 1]
    : null

  await ensureDir(OUT)

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--force-device-scale-factor=2'],
  })

  try {
    if (!only || only === 'v0-3-3') await captureV033(browser)
    if (!only || only === 'v0-3-2') await captureV032(browser)
    if (!only || only === 'v0-3-1') await captureV031(browser)
    if (!only || only === 'v0-2') await captureV02(browser)
  } finally {
    await browser.close()
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
