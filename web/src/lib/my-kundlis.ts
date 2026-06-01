const STORAGE_KEY = 'kk-my-kundlis'

export function getMyKundliSlugs(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return new Set()
    }

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return new Set()
    }

    return new Set(parsed.filter((value): value is string => typeof value === 'string'))
  } catch {
    return new Set()
  }
}

export function addMyKundliSlug(slug: string): void {
  const slugs = getMyKundliSlugs()
  slugs.add(slug)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...slugs]))
}

export function isMyKundli(slug: string): boolean {
  return getMyKundliSlugs().has(slug)
}
