import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { hierarchy, pack } from 'd3-hierarchy'
import { data } from './data.ts'

interface Owner {
  login: string
  stars: number
  children?: Owner[]
}

const WIDTH = 1200
const RADIUS_MIN = 10
const RADIUS_MAX = 300
const PADDING = WIDTH / 400
const AVATAR_SIZE_MAX = 480
const FETCH_CONCURRENCY = 12

// Multiple repos may share an owner; one circle per owner, weighted by total stars
const starsByOwner = new Map<string, number>()
for (const repo of data) {
  const login = new URL(repo.url).pathname.split('/')[1]
  starsByOwner.set(login, (starsByOwner.get(login) ?? 0) + repo.stars)
}
const owners: Owner[] = [...starsByOwner]
  .map(([login, stars]) => ({ login, stars }))
  .toSorted((a, b) => b.stars - a.stars)

const starsMax = owners[0].stars

function lerp(a: number, b: number, t: number): number {
  return t < 0 ? a : a + (b - a) * t
}

function weight(stars: number): number {
  return lerp(RADIUS_MIN, RADIUS_MAX, (stars / starsMax) ** 0.9)
}

const root = hierarchy<Owner>({ login: '', stars: 0, children: owners })
  .sum((d) => (d.children ? 0 : weight(d.stars)))
  .sort((a, b) => (b.value || 0) - (a.value || 0))

const circles = pack<Owner>()
  .size([WIDTH, WIDTH])
  .padding(PADDING)(root)
  .descendants()
  .slice(1)

async function fetchImage(url: string): Promise<string | undefined> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 404) return
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt
        await sleep(retryAfter * 1000)
        throw new Error(`HTTP 429`)
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const type = res.headers.get('content-type') ?? 'image/png'
      const buffer = Buffer.from(await res.arrayBuffer())
      return `data:${type};base64,${buffer.toString('base64')}`
    } catch (error) {
      if (attempt === 4) console.warn(`Failed to fetch ${url}:`, error)
    }
  }
}

// The CDN serves its default avatar (HTTP 200) for logins it cannot resolve
// by name — mostly org accounts — instead of a 404
const defaultAvatarHashes = new Map<number, Promise<string | undefined>>()
async function isDefaultAvatar(
  avatar: string,
  size: number,
): Promise<boolean> {
  let promise = defaultAvatarHashes.get(size)
  if (!promise) {
    promise = fetchImage(
      `https://avatars.githubusercontent.com/login-that-does-not-exist-a2c94?size=${size}`,
    ).then((image) => image && sha1(image))
    defaultAvatarHashes.set(size, promise)
  }
  return (await promise) === sha1(avatar)
}

function sha1(text: string): string {
  return createHash('sha1').update(text).digest('hex')
}

async function fetchAvatar(
  login: string,
  size: number,
): Promise<string | undefined> {
  const avatar = await fetchImage(
    `https://avatars.githubusercontent.com/${login}?size=${size}`,
  )
  if (avatar && !(await isDefaultAvatar(avatar, size))) return avatar
  // fall back to github.com, which resolves any login via redirect but rate-limits hard
  return fetchImage(`https://github.com/${login}.png?size=${size}`)
}

console.info(`Fetching ${circles.length} avatars...`)
const avatars = new Map<string, string>()
let cursor = 0
await Promise.all(
  Array.from({ length: FETCH_CONCURRENCY }, async () => {
    while (cursor < circles.length) {
      const circle = circles[cursor++]
      // 2x the on-canvas diameter so it stays sharp on high-DPI screens
      const size = Math.min(AVATAR_SIZE_MAX, Math.ceil(circle.r * 4))
      const avatar = await fetchAvatar(circle.data.login, size)
      if (avatar) avatars.set(circle.data.login, avatar)
    }
  }),
)
console.info(`Fetched ${avatars.size}/${circles.length} avatars`)

let body = ''
for (const [index, circle] of circles.entries()) {
  const avatar = avatars.get(circle.data.login)
  if (!avatar) continue
  const { x, y, r } = circle
  body += `<clipPath id="c${index}"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}"/></clipPath>`
  body += `<image clip-path="url(#c${index})" x="${(x - r).toFixed(2)}" y="${(y - r).toFixed(2)}" width="${(r * 2).toFixed(2)}" height="${(r * 2).toFixed(2)}" href="${avatar}"><title>${circle.data.login} (${circle.data.stars} stars)</title></image>`
  body += '\n'
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${WIDTH}" viewBox="0 0 ${WIDTH} ${WIDTH}">
${body}</svg>
`

await writeFile('./circles.svg', svg)
console.info('Wrote circles.svg')
