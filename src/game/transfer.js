import { isSealed } from './vault.js'
import { isCreatorCode, openCreator } from './creator.js'
import { sealForTransfer, openTransfer, admitImported, readSave } from './saveFile.js'

/*
  Moving a save between browsers and devices without a server:
  - a .aetheria file to download and load again,
  - a transfer code / link.
  Both hold the save deflated and sealed (vault.js), so they cannot be read or edited outside the game.
  Older plain ones (.json files, AE1 codes, base64 codes) are always taken in, after the review of
  plausibility.js (saveFile.js).
*/
const CODE_PREFIX = 'AE1.'
const LINK_PARAM = 'import'

const fromB64Url = str => {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer())

export const encodeCode = save => sealForTransfer(save)

// The message for a save that could not be taken in: a sealed one changed outside the game, or simply
// not a save
export const importErrorKey = e => (e?.message === 'tampered' ? 'integrity.tampered' : 'settings.invalidSave')

const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v)
const isCount = v => Number.isFinite(v) && v >= 0

// The shape every save has had since the first version. Anything else (another game's file, a save
// edited by hand into something broken) is refused before it can replace a game; finer damage, like a
// single bad number, is repaired when the save loads
export function isSave(s) {
  return isObject(s)
    && typeof s.name === 'string' && s.name.trim() !== ''
    && isObject(s.skills) && Object.keys(s.skills).length > 0
    && Object.values(s.skills).every(k => isObject(k) && isCount(k.xp))
    && (s.gold == null || isCount(s.gold))
    && ['version', 'lastTick', 'created'].every(k => s[k] == null || Number.isFinite(s[k]))
    && ['hero', 'inventory', 'equipment', 'stats', 'settings'].every(k => s[k] == null || isObject(s[k]))
}

function validate(s) {
  if (!isSave(s)) throw new Error('Invalid save')
  return s
}

// Accepts a transfer code, an old base64 code, a link containing a code, or the text of a save file
export async function decodeAny(text) {
  let str = String(text || '').trim()
  const fromLink = str.match(new RegExp(`[#&?]${LINK_PARAM}=([^&\\s]+)`))
  if (fromLink) str = decodeURIComponent(fromLink[1])
  if (isCreatorCode(str)) return validate(await openCreator(str))
  if (isSealed(str)) return validate(await openTransfer(str))
  if (str.startsWith(CODE_PREFIX)) {
    const bytes = await pipe(fromB64Url(str.slice(CODE_PREFIX.length)), new DecompressionStream('deflate-raw'))
    return validate(admitImported(JSON.parse(new TextDecoder().decode(bytes))))
  }
  if (str.startsWith('{')) {
    const data = JSON.parse(str)
    // The rescue file from a game that could not start holds every slot: take the one played last
    const slots = Object.keys(data).filter(k => /^aetheria-slot-\d+$/.test(k))
    if (slots.length) {
      const saves = slots.map(k => { try { return readSave(data[k], { imported: true }) } catch { return null } }).filter(Boolean)
      return validate(saves.sort((a, b) => (b.lastTick || 0) - (a.lastTick || 0))[0])
    }
    return validate(admitImported(data.game === 'aetheria' ? data.save : data))
  }
  return validate(admitImported(JSON.parse(decodeURIComponent(escape(atob(str))))))
}

export async function makeLink(save) {
  const base = location.href.split('#')[0].split('?')[0]
  return `${base}#${LINK_PARAM}=${await encodeCode(save)}`
}

// A save waiting in the address bar (opened from a transfer link); the hash is cleared once read
export function takeLinkCode() {
  const m = location.hash.match(new RegExp(`${LINK_PARAM}=([^&]+)`))
  if (!m) return null
  history.replaceState(null, '', location.pathname + location.search)
  return decodeURIComponent(m[1])
}

const slug = s => String(s || 'hero').normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'hero'

export async function downloadFile(save) {
  const blob = new Blob([await sealForTransfer(save)], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `aetheria-${slug(save.name)}-${new Date().toISOString().slice(0, 10)}.aetheria`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// Opens the file picker and resolves with the decoded save (or null if cancelled)
export function pickFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.aetheria,.json,application/json,.txt,text/plain'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      try { resolve(await decodeAny(await file.text())) } catch (e) { reject(e) }
    }
    input.click()
  })
}
