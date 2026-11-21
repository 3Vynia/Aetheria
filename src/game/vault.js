import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { randomBytes, utf8ToBytes } from '@noble/hashes/utils.js'

/*
  VAULT — saves are sealed, not written as plain JSON.

  Every save (in the browser, in a downloaded file, in a transfer code) is encrypted and authenticated
  with XChaCha20-Poly1305 under a 256-bit key. Changing a single character makes it refuse to open, so a
  save cannot be read or edited by hand or by pasting it into a chatbot. A 256-bit symmetric key keeps
  its strength against quantum computers too.

  The key is not in the source code: the official builds get it from a repository secret (SAVE_KEY),
  and local builds from .env.local. Without one, a development key is used, and the saves it seals
  only open in other development builds.

  Format: "AE2." + base64url( key id (1 byte) | nonce (24 bytes) | ciphertext + tag )
*/
export const SEALED = 'AE2.'
const KEY_ID = 1
const DEV_SECRET = 'aetheria-development-key-not-for-release'

// In the game the key comes from the build; in the creator's scripts (Node) from the environment
const secret = import.meta.env?.VITE_SAVE_KEY || (typeof globalThis.process !== 'undefined' && globalThis.process.env?.VITE_SAVE_KEY) || DEV_SECRET
export const usingDevKey = secret === DEV_SECRET
const KEY = hkdf(sha256, utf8ToBytes(secret), utf8ToBytes('aetheria'), utf8ToBytes('saves v2'), 32)

const toB64Url = bytes => {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64Url = str => {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}
export { toB64Url, fromB64Url }

export const isSealed = str => typeof str === 'string' && str.startsWith(SEALED)

// Seals bytes (or a string)
export function sealBytes(data) {
  const plain = typeof data === 'string' ? utf8ToBytes(data) : data
  const nonce = randomBytes(24)
  const box = xchacha20poly1305(KEY, nonce, Uint8Array.of(KEY_ID)).encrypt(plain)
  const out = new Uint8Array(1 + 24 + box.length)
  out[0] = KEY_ID
  out.set(nonce, 1)
  out.set(box, 25)
  return SEALED + toB64Url(out)
}

// Opens a sealed string; throws 'tampered' if it was changed, made with another key or is not a seal
export function openBytes(str) {
  if (!isSealed(str)) throw new Error('tampered')
  let raw
  try { raw = fromB64Url(str.slice(SEALED.length)) } catch { throw new Error('tampered') }
  if (raw.length < 25 + 16 || raw[0] !== KEY_ID) throw new Error('tampered')
  try {
    return xchacha20poly1305(KEY, raw.subarray(1, 25), Uint8Array.of(KEY_ID)).decrypt(raw.subarray(25))
  } catch { throw new Error('tampered') }
}

export const seal = obj => sealBytes(JSON.stringify(obj))
export const open = str => JSON.parse(new TextDecoder().decode(openBytes(str)))
