// How far each language has been translated: writes src/i18n/progress.js (which the language menu
// reads), and a progress card for the README in a dark and a light version (docs/translations-*.svg).
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
const ENGLISH = { en: 'English', es: 'Spanish', ko: 'Korean', ja: 'Japanese', zh: 'Chinese', pt: 'Portuguese', ru: 'Russian', de: 'German', fr: 'French' }
const THEMES = {
  dark: { bg1: '#1d1a2b', bg2: '#12111b', line: '#3a3350', title: '#f3d58a', ink: '#efe9dc', faint: '#9b93ad', track: '#2a2539', done1: '#6fd28a', done2: '#2ea043', part1: '#f3d58a', part2: '#b8862e', soon: '#6e6880' },
  light: { bg1: '#fbf7ee', bg2: '#f1e9d8', line: '#e0d3b6', title: '#8a6219', ink: '#2b2418', faint: '#7c705c', track: '#e8dec9', done1: '#4cbf6a', done2: '#238636', part1: '#e2b65a', part2: '#a2741f', soon: '#b3a891' },
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

// A card with one bar per language, two columns, filling up as it loads
export function card(rows, mode) {
  const t = THEMES[mode]
  const W = 840, colW = 380, rowH = 62, top = 96, pad = 30
  const perCol = Math.ceil(rows.length / 2)
  const H = top + perCol * rowH + 24
  const full = rows.filter(r => r.pct === 100).length
  const items = rows.map((r, i) => {
    const x = pad + (i >= perCol ? colW + 20 : 0)
    const y = top + (i % perCol) * rowH
    const kind = r.pct === 100 ? 'done' : r.pct ? 'part' : 'soon'
    const label = r.pct === 100 ? 'Complete' : r.pct ? `${r.pct}%` : 'Coming soon'
    const fill = Math.max(r.pct ? 6 : 0, (colW * r.pct) / 100)
    const grad = kind === 'done' ? 'url(#gDone)' : 'url(#gPart)'
    return `
  <g transform="translate(${x},${y})">
    <text x="0" y="16" class="name">${esc(r.name)}</text>
    <text x="${colW}" y="16" class="pct ${kind}" text-anchor="end">${label}</text>
    ${ENGLISH[r.loc] && ENGLISH[r.loc] !== r.name ? `<text x="0" y="33" class="sub">${ENGLISH[r.loc]}</text>` : ""}
    <rect x="0" y="40" width="${colW}" height="9" rx="4.5" fill="${t.track}"/>
    ${fill ? `<rect x="0" y="40" width="${fill.toFixed(1)}" height="9" rx="4.5" fill="${grad}"><animate attributeName="width" from="0" to="${fill.toFixed(1)}" dur="1.2s" begin="${(0.1 + i * 0.08).toFixed(2)}s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1"/></rect>` : ''}
  </g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Translation progress: ${full} of ${rows.length} languages complete">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.bg1}"/><stop offset="1" stop-color="${t.bg2}"/></linearGradient>
    <linearGradient id="gDone" x1="0" x2="1"><stop offset="0" stop-color="${t.done2}"/><stop offset="1" stop-color="${t.done1}"/></linearGradient>
    <linearGradient id="gPart" x1="0" x2="1"><stop offset="0" stop-color="${t.part2}"/><stop offset="1" stop-color="${t.part1}"/></linearGradient>
  </defs>
  <style>
    text { font-family: -apple-system, 'Segoe UI', 'Noto Sans', 'Noto Sans CJK JP', 'Noto Sans KR', 'Hiragino Sans', 'Malgun Gothic', 'Microsoft YaHei', sans-serif; }
    .title { font: 600 22px Georgia, 'Times New Roman', serif; fill: ${t.title}; letter-spacing: 0.06em; }
    .lead { font-size: 13px; fill: ${t.faint}; }
    .name { font-size: 15px; font-weight: 600; fill: ${t.ink}; }
    .sub { font-size: 11px; fill: ${t.faint}; letter-spacing: 0.04em; text-transform: uppercase; }
    .pct { font-size: 13px; font-weight: 700; }
    .done { fill: ${t.done2}; } .part { fill: ${t.part2}; } .soon { fill: ${t.soon}; font-weight: 500; }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" fill="url(#bg)" stroke="${t.line}"/>
  <text x="${pad}" y="46" class="title">TRANSLATIONS</text>
  <text x="${pad}" y="68" class="lead">${full} of ${rows.length} languages complete · more on the way</text>
  <line x1="${pad}" y1="80" x2="${W - pad}" y2="80" stroke="${t.line}"/>${items}
</svg>
`
}

const PICTURE = `<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/translations-light.svg">
    <img src="docs/translations-dark.svg" alt="Translation progress of every language" width="840">
  </picture>
</p>`

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = await measure()
  const progress = Object.fromEntries(rows.filter(r => !r.required).map(r => [r.loc, r.pct]))
  writeFileSync(join(root, 'src/i18n/progress.js'),
    `// Written by scripts/i18n-progress.mjs: the share of texts translated in each language\nexport default ${JSON.stringify(progress, null, 2).replace(/"(\w+)":/g, '$1:')}\n`)
  for (const mode of Object.keys(THEMES)) writeFileSync(join(root, `docs/translations-${mode}.svg`), card(rows, mode))
  const readme = join(root, 'README.md')
  const text = readFileSync(readme, 'utf8')
  const START = '<!-- translations:start -->', END = '<!-- translations:end -->'
  if (text.includes(START) && text.includes(END)) {
    const out = text.slice(0, text.indexOf(START) + START.length) + '\n' + PICTURE + '\n' + text.slice(text.indexOf(END))
    writeFileSync(readme, out)
  } else console.log('README has no translations markers; table not written')
  rows.forEach(r => console.log(`${r.loc.padEnd(3)} ${bar(r.pct)} ${String(r.pct).padStart(3)}%  ${r.done}/${r.total}`))
}
