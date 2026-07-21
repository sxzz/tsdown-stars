import { readdir, writeFile } from 'node:fs/promises'
import { format } from 'prettier'

const files = (await readdir('./data'))
  .filter((file) => file.endsWith('.json'))
  .toSorted()
const filename = files.at(-1)
const { default: data } = await import(`./data/${filename}`, {
  with: { type: 'json' },
})

let text = `| url | stars |
|-----|-------|
`

for (const item of data) {
  const stars =
    item.stars > 1000 ? `${(item.stars / 1000).toFixed(1)}k` : item.stars
  text += `| ${item.url} | ${stars} |
`
}

await writeFile('./README.md', await format(text, { parser: 'markdown' }))
