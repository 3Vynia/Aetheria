import { seal, open, isSealed, sealBytes, openBytes } from './vault.js'
import { reviewSave } from './plausibility.js'

/*
  How a save is admitted into the game.
  - Sealed saves (vault.js) are opened and trusted: only the game can have written them.
  - Plain JSON from the player's own browser (slots and backups from before sealing) is sealed as it is:
    no player's game is ever judged, blocked or lost by the change.
  - Plain JSON brought in from outside (old files and codes, or anything written by hand or by a
    chatbot) goes through the review of plausibility.js and keeps the verdict, inside its seal.
  The verdict lives in save.integrity: { status: 'sealed' | 'reviewed' | 'altered' | 'creator', ... }
*/

// A plain save from this player's own browser (a slot or backup from before sealing, or one written by
// an older version still open in another tab) is theirs: it is sealed as it is, never judged. It keeps
// an earlier "altered" mark, but cannot make itself a creator save
export function adoptPlain(s) {
  if (!s || typeof s !== 'object') throw new Error('Invalid save')
  s.integrity = s.integrity?.status === 'altered' ? s.integrity : { status: 'sealed', adopted: Date.now() }
  return s
}

// A plain save brought in from outside (an old .json file or code) goes through the review, and keeps
// the verdict, inside its seal, from then on. It is always taken in: at worst it is marked as altered
export function admitImported(s) {
  if (!s || typeof s !== 'object') throw new Error('Invalid save')
  const before = s.integrity?.status === 'altered' ? s.integrity : null
  const review = reviewSave(s)
  s.integrity = before || (review.ok
    ? { status: 'reviewed', at: Date.now() }
    : { status: 'altered', at: Date.now(), reasons: review.reasons.slice(0, 6) })
  return s
}

// A save as the browser keeps it (slots, backups), sealed or, from older versions, plain. `imported`
// marks text the player brought in from outside
export function readSave(raw, { imported = false } = {}) {
  if (isSealed(raw)) return open(raw)
  const s = JSON.parse(raw)
  return imported ? admitImported(s) : adoptPlain(s)
}
export const writeSave = obj => seal(obj)

/* Files and transfer codes are compressed before sealing, so links stay short */
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer())
export async function sealForTransfer(obj) {
  return sealBytes(await pipe(new TextEncoder().encode(JSON.stringify(obj)), new CompressionStream('deflate-raw')))
}
export async function openTransfer(str) {
  const bytes = openBytes(str)
  // Saves sealed by the browser store are plain JSON inside; transfers are deflated
  const json = bytes[0] === 0x7b ? bytes : await pipe(bytes, new DecompressionStream('deflate-raw'))
  return JSON.parse(new TextDecoder().decode(json))
}
