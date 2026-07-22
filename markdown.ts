import { writeFile } from 'node:fs/promises'
import { format } from 'prettier'
import { data, date } from './data.ts'

const compact = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

let text = `![Avatars of project owners using tsdown, sized by star count](./circles.svg)

<details>
<summary><b>Projects using tsdown with over 100 stars (A total of ${data.length} as of ${date})</b></summary>

| url | stars |
|-----|-------|
`

for (const item of data) {
  text += `| ${item.url} | ${compact.format(item.stars)} |
`
}

text += `
</details>`

await writeFile('./README.md', await format(text, { parser: 'markdown' }))
