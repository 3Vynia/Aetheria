// How far each language has been translated: writes src/i18n/progress.js (which the language menu
// reads) and the progress table of the README, between its translations markers.
// Run it after translating: npm run i18n:progress
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = p => import(pathToFileURL(join(root, p)))
const flatten = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') flatten(v, key, out)
    else out[key] = v
  }
  return out
}

export async function measure() {
  const { LOCALES } = await load('src/i18n/index.js')
  const en = flatten((await load('src/i18n/locales/en.js')).default)
  const total = Object.keys(en).length
  const rows = []
  for (const [loc, l] of Object.entries(LOCALES)) {
    const msgs = flatten((await load(`src/i18n/locales/${loc}.js`)).default)
    const done = Object.keys(en).filter(k => k in msgs).length
    // Whole numbers, but never 100 until every text is in, nor 0 once one is
    const pct = done === total ? 100 : done ? Math.min(99, Math.max(1, Math.floor((done / total) * 100))) : 0
    rows.push({ loc, name: l.name, required: !!l.required, done, total, pct })
  }
  return rows
}

const bar = pct => '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5))
const colour = pct => (pct === 100 ? '2ea043' : pct >= 50 ? 'b8862e' : '6e7681')
const badge = pct => `<img alt="${pct}%" src="https://img.shields.io/badge/${pct}%25-${pct === 100 ? 'complete' : pct ? 'in%20progress' : 'coming%20soon'}-${colour(pct)}?style=flat-square">`

export function table(rows) {
  const cells = rows.map(r => `<td align="center"><b>${r.name}</b><br>${badge(r.pct)}</td>`)
  const lines = []
  for (let i = 0; i < cells.length; i += 3) lines.push(`  <tr>${cells.slice(i, i + 3).join('')}</tr>`)
  return `<table align="center">\n${lines.join('\n')}\n</table>`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = await measure()
  const progress = Object.fromEntries(rows.filter(r => !r.required).map(r => [r.loc, r.pct]))
  writeFileSync(join(root, 'src/i18n/progress.js'),
    `// Written by scripts/i18n-progress.mjs: the share of texts translated in each language\nexport default ${JSON.stringify(progress, null, 2).replace(/"(\w+)":/g, '$1:')}\n`)
  const readme = join(root, 'README.md')
  const text = readFileSync(readme, 'utf8')
  const START = '<!-- translations:start -->', END = '<!-- translations:end -->'
  if (text.includes(START) && text.includes(END)) {
    const out = text.slice(0, text.indexOf(START) + START.length) + '\n' + table(rows) + '\n' + text.slice(text.indexOf(END))
    writeFileSync(readme, out)
  } else console.log('README has no translations markers; table not written')
  rows.forEach(r => console.log(`${r.loc.padEnd(3)} ${bar(r.pct)} ${String(r.pct).padStart(3)}%  ${r.done}/${r.total}`))
}
