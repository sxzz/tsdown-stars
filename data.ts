import { readdir } from 'node:fs/promises'

export interface Repo {
  url: string
  stars: number
}

const files = (await readdir('./data'))
  .filter((file) => file.endsWith('.json'))
  .toSorted()
const filename = files.at(-1)!

export const date: string = filename.split('.', 1)[0]
export const { default: data }: { default: Repo[] } = await import(
  `./data/${filename}`,
  { with: { type: 'json' } }
)
