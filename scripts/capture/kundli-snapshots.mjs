#!/usr/bin/env node
/**
 * Freeze saved kundlis as rendered screenshots.
 *
 * API server + web app must be running. For Supabase storage uploads, run the
 * 002 migration first so the public `kundli-snapshots` bucket exists.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

const WEB_URL = (process.env.WEB_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const API_URL = (process.env.API_URL ?? 'http://localhost:8787').replace(/\/$/, '')
const SNAPSHOT_BUCKET = process.env.KUNDLI_SNAPSHOT_BUCKET ?? 'kundli-snapshots'
const SNAPSHOT_TOKEN = process.env.KUNDLI_SNAPSHOT_TOKEN ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '')
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const VIEWPORT_WIDTH = Number(process.env.KUNDLI_SNAPSHOT_WIDTH ?? 960)
const VIEWPORT_HEIGHT = Number(process.env.KUNDLI_SNAPSHOT_VIEWPORT_HEIGHT ?? 1400)
const CHUNK_HEIGHT = Number(process.env.KUNDLI_SNAPSHOT_CHUNK_HEIGHT ?? 1800)
const DEVICE_SCALE_FACTOR = Number(process.env.KUNDLI_SNAPSHOT_DSF ?? 2)
const VERSION = 1

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function parseArgs() {
  const args = process.argv.slice(2)
  const slugs = []
  let force = false

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--force') {
      force = true
      continue
    }
    if (arg === '--slug') {
      const value = args[i + 1]
      if (!value) throw new Error('Missing value after --slug')
      slugs.push(...value.split(',').map((s) => s.trim()).filter(Boolean))
      i += 1
      continue
    }
    if (arg?.startsWith('--slug=')) {
      slugs.push(...arg.slice('--slug='.length).split(',').map((s) => s.trim()).filter(Boolean))
      continue
    }
    if (arg === '--all') {
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return { slugs, force }
}

async function api(pathname, init = {}) {
  const res = await fetch(`${API_URL}${pathname}`, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init.method ?? 'GET'} ${pathname} failed (${res.status}): ${text}`)
  }
  return res.json()
}

async function listSlugs() {
  const slugs = []
  for (let offset = 0; ; offset += 100) {
    const body = await api(`/kundlis?limit=100&offset=${offset}`)
    const items = body.items ?? []
    slugs.push(...items.map((item) => item.slug))
    if (items.length < 100) break
  }
  return slugs
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
  await sleep(300)
}

async function captureSlug(browser, slug, snapshotId) {
  const page = await browser.newPage()
  await page.setViewport({
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
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

    const chunks = []
    const totalHeight = await page.evaluate((el) => Math.ceil(el.getBoundingClientRect().height), root)
    const width = VIEWPORT_WIDTH

    for (let top = 0, index = 0; top < totalHeight; top += CHUNK_HEIGHT, index += 1) {
      const height = Math.min(CHUNK_HEIGHT, totalHeight - top)
      await page.setViewport({
        width: VIEWPORT_WIDTH,
        height,
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
      })
      await page.evaluate((y) => window.scrollTo(0, y), top)
      await sleep(120)
      const buffer = await page.screenshot({
        type: 'webp',
        quality: 88,
      })
      const filename = `${String(index + 1).padStart(3, '0')}.webp`
      const url = await storeChunk(slug, snapshotId, filename, buffer)
      chunks.push({ index, url, width, height })
      console.log(`  ${slug} ${filename} ${width}x${height}`)
    }

    return chunks
  } finally {
    await page.close()
  }
}

async function storeChunk(slug, snapshotId, filename, buffer) {
  const objectPath = `${slug}/${snapshotId}/${filename}`

  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/${SNAPSHOT_BUCKET}/${objectPath}`, {
      method: 'PUT',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'x-upsert': 'true',
      },
      body: buffer,
    })

    if (!upload.ok) {
      const text = await upload.text().catch(() => '')
      throw new Error(`snapshot upload failed (${upload.status}): ${text}`)
    }

    return `${SUPABASE_URL}/storage/v1/object/public/${SNAPSHOT_BUCKET}/${objectPath}`
  }

  const outDir = path.join(ROOT, 'web/public/kundli-snapshots', slug, snapshotId)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, filename), buffer)
  return `/kundli-snapshots/${slug}/${snapshotId}/${filename}`
}

async function updateSnapshot(slug, snapshot) {
  const headers = { 'Content-Type': 'application/json' }
  if (SNAPSHOT_TOKEN) {
    headers.Authorization = `Bearer ${SNAPSHOT_TOKEN}`
  }

  await api(`/kundlis/${slug}/snapshot`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ snapshot }),
  })
}

function snapshotId(createdAt) {
  return createdAt.replaceAll(':', '').replaceAll('.', '').replace('Z', 'z')
}

async function main() {
  const { slugs: requestedSlugs, force } = parseArgs()
  const slugs = requestedSlugs.length > 0 ? requestedSlugs : await listSlugs()

  if (slugs.length === 0) {
    console.log('No kundlis found.')
    return
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--force-device-scale-factor=2'],
  })

  try {
    for (const slug of slugs) {
      const record = await api(`/kundlis/${encodeURIComponent(slug)}`)
      if (record.snapshot?.chunks?.length && !force) {
        console.log(`skip ${slug} — snapshot exists`)
        continue
      }

      console.log(`capture ${slug}`)
      const createdAt = new Date().toISOString()
      const id = snapshotId(createdAt)
      const chunks = await captureSlug(browser, slug, id)
      await updateSnapshot(slug, {
        version: VERSION,
        createdAt,
        viewportWidth: VIEWPORT_WIDTH,
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
        chunks,
      })
      console.log(`  updated ${slug}`)
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
