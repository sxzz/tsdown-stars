import { writeFile } from 'node:fs/promises'
import { uniqBy } from 'es-toolkit'
import { getDependents } from 'top-github-dependents-by-stars'

const raw = await getDependents('rolldown/tsdown', {
  type: 'repositories',
  rows: Infinity,
  minStars: 100,
})

const data = uniqBy(
  [...raw.latestDependents, ...raw.repositories]
    .toSorted((a, b) => b.stars - a.stars)
    .filter((item) => item.stars >= 100),
  (item) => item.url,
)

await writeFile(
  `./data/${new Date().toISOString().split('T', 1)[0]}.json`,
  `${JSON.stringify(data, null, 2)}\n`,
)
