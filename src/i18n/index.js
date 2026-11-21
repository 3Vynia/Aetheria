import { createI18n } from 'vue-i18n'

export const LOCALES = {
  en: { name: 'English', intl: 'en-US', load: () => import('./locales/en.js') },
  es: { name: 'Español', intl: 'es-ES', load: () => import('./locales/es.js') },
  // Being translated: only offered while developing until every text is done; what is missing reads in English
  ko: { name: '한국어', intl: 'ko-KR', load: () => import('./locales/ko.js'), draft: true, font: 'https://fonts.googleapis.com/css2?family=Gowun+Batang&family=Gowun+Dodum&display=swap' },
}
// The languages a player can pick (drafts only show while developing)
export const PLAYABLE = Object.fromEntries(Object.entries(LOCALES).filter(([, l]) => !l.draft || import.meta.env?.DEV))
const STORAGE_KEY = 'aetheria-locale'

export function detectLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && PLAYABLE[saved]) return saved
  } catch { /* storage unavailable */ }
  const nav = (typeof navigator !== 'undefined' && navigator.language || 'en').slice(0, 2)
  return PLAYABLE[nav] ? nav : 'en'
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  // Every language loads on demand (see setLocale), so a player downloads only the one they play in.
  // The i18n check keeps all of them complete, so nothing needs a fallback from another language
  locale: 'en',
  fallbackLocale: 'en',
  messages: {},
  warnHtmlMessage: false,
  missingWarn: false,
  fallbackWarn: false,
})

export const t = (key, params) => i18n.global.t(key, params || {})
export const te = key => i18n.global.te(key)
export const currentLocale = () => i18n.global.locale.value
export const intlLocale = () => LOCALES[currentLocale()]?.intl || 'en-US'

export function applyDocumentLocale() {
  if (typeof document === 'undefined') return
  const loc = currentLocale()
  document.documentElement.lang = loc
  // Scripts the game's fonts do not cover bring their own, loaded only for the players who need them
  const font = LOCALES[loc]?.font
  if (font && !document.querySelector(`link[data-font="${loc}"]`)) {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: font })
    link.dataset.font = loc
    document.head.appendChild(link)
  }
}

/*
  The king and the archmage are named anew in every game. The texts are written with the names they
  first had; each loaded language keeps its messages as written and is given a copy with the names of
  the game being played (only remade when those names change)
*/
const STORY_NAMES = { edmund: 'Edmund', selene: 'Selene' }
const written = {}
const appliedNames = {}
let storyNames = null
const renameDeep = (v, re, map) => (typeof v === 'string' ? v.replace(re, w => map[w])
  : Array.isArray(v) ? v.map(x => renameDeep(x, re, map))
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, renameDeep(x, re, map)])) : v)
function renameLocale(loc) {
  const map = {}
  for (const [id, first] of Object.entries(STORY_NAMES)) if (storyNames?.[id] && storyNames[id] !== first) map[first] = storyNames[id]
  const key = JSON.stringify(map)
  if (appliedNames[loc] === key) return
  appliedNames[loc] = key
  const words = Object.keys(map)
  i18n.global.setLocaleMessage(loc, words.length ? renameDeep(written[loc], new RegExp(`\\b(${words.join('|')})\\b`, 'g'), map) : written[loc])
}
export function applyStoryNames(names) {
  storyNames = names
  for (const loc of Object.keys(written)) renameLocale(loc)
}

export async function setLocale(loc) {
  if (!LOCALES[loc]) return
  // A language still being translated falls back to English, so English comes with it
  for (const l of LOCALES[loc].draft ? ['en', loc] : [loc]) {
    if (written[l]) continue
    written[l] = (await LOCALES[l].load()).default
    renameLocale(l)
  }
  i18n.global.locale.value = loc
  try { localStorage.setItem(STORAGE_KEY, loc) } catch { /* storage unavailable */ }
  applyDocumentLocale()
}

/*
  Message parameters can reference game entities as "@kind:id" (e.g. "@item:iron_ore").
  They are resolved to the localized name at render time, so stored messages
  (journal entries, offline reports) follow the current language.
*/
const resolvers = {}
export function registerNames(kind, fn) { resolvers[kind] = fn }
export function resolveParams(params = {}) {
  const out = {}
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && v.startsWith('@')) {
      const i = v.indexOf(':')
      const fn = resolvers[v.slice(1, i)]
      out[k] = fn ? fn(v.slice(i + 1)) : v
    } else out[k] = v
  }
  return out
}
// Translate a { key, params } message or pass through a legacy plain string
export function tm(msg, params) {
  if (!msg) return ''
  if (typeof msg === 'string') return te(msg) ? t(msg, resolveParams(params)) : msg
  if (msg.text) return msg.text
  return t(msg.key, resolveParams(msg.params))
}
