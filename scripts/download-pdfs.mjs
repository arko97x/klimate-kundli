#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'data/archived-kundlis')

// Load environment variables manually from .env
function loadEnv() {
  try {
    const envPath = path.join(ROOT, '.env')
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8')
      for (const line of content.split('\n')) {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
        if (match) {
          const key = match[1]
          let val = match[2] ?? ''
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
          if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
          process.env[key] = val.trim()
        }
      }
    }
  } catch (err) {
    console.warn(`Warning: Could not read .env file: ${err.message}`)
  }
}

loadEnv()

const WEB_URL = (process.env.WEB_URL ?? 'https://klimatekundli.com').replace(/\/$/, '')
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '')
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VIEWPORT_WIDTH = 960
const VIEWPORT_HEIGHT = 1400

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchAllKundlisFromSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env file.')
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/kundlis?select=slug,birth_city_display,birth_year,created_at&order=created_at.desc`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    }
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Supabase select query failed (${res.status}): ${text}`)
  }

  const rows = await res.json()
  return rows.map((row) => ({
    slug: row.slug,
    birthCityDisplay: row.birth_city_display,
    birthYear: row.birth_year,
    createdAt: row.created_at,
  }))
}

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
  await sleep(400)
}

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9_-]/gi, '_').replace(/_+/g, '_')
}

async function main() {
  const force = process.argv.includes('--force')
  fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log('Connecting directly to Supabase Postgres database...')
  let items = []
  try {
    items = await fetchAllKundlisFromSupabase()
  } catch (err) {
    console.error(`Error: Could not retrieve saved records: ${err.message}`)
    process.exit(1)
  }

  console.log(`Found ${items.length} total saved kundlis.`)
  if (items.length === 0) {
    console.log('No records found to download.')
    return
  }

  console.log(`Targeting production web URL: ${WEB_URL}`)
  console.log('Launching browser...')
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--force-device-scale-factor=2', '--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const { slug, birthCityDisplay, birthYear } = item
      const cityShort = birthCityDisplay.split(',')[0].trim()
      const filename = `${sanitizeFilename(cityShort)}_${birthYear}_${slug}.pdf`
      const outputPath = path.join(OUT_DIR, filename)

      if (fs.existsSync(outputPath) && !force) {
        console.log(`[${i + 1}/${items.length}] Skipping ${slug} (already downloaded as ${filename})`)
        continue
      }

      console.log(`[${i + 1}/${items.length}] Rendering ${slug} (${cityShort}, born ${birthYear}) to PDF...`)
      
      const page = await browser.newPage()
      await page.setViewport({
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
        deviceScaleFactor: 2,
      })

      // Capture browser console errors to assist in troubleshooting rendering crashes
      page.on('pageerror', (err) => {
        console.error(`  [browser error] ${err.message}`)
      })

      try {
        await page.goto(`${WEB_URL}/capture/k/${slug}`, {
          waitUntil: 'networkidle0',
          timeout: 60_000,
        })
        await page.waitForSelector('[data-kundli-capture-ready="true"]', { timeout: 60_000 })
        await page.evaluate(() => document.fonts?.ready)
        await expandScrollContainers(page)

        const root = await page.$('[data-kundli-capture-root]')
        if (!root) throw new Error('capture root not found')

        const totalHeight = await page.evaluate((el) => Math.ceil(el.getBoundingClientRect().height), root)

        // Generate PDF using Puppeteer
        await page.pdf({
          path: outputPath,
          printBackground: true,
          width: `${VIEWPORT_WIDTH}px`,
          height: `${totalHeight + 40}px`,
          margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
        })
        
        console.log(`  Saved: ${filename}`)
      } catch (err) {
        console.error(`  Failed to render slug ${slug}: ${err.message}`)
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }

  console.log(`\nDone. PDFs are available in: ${path.relative(ROOT, OUT_DIR)}/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
