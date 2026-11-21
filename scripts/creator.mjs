#!/usr/bin/env node
/*
  Creator saves — signed with ML-DSA-65 (FIPS 204), a post-quantum signature.

  The private key never leaves this computer: it lives in ~/.config/aetheria/creator.key, outside the
  repository. The game only carries the public key (src/game/creatorKey.js), which can check a
  signature but never make one, so nobody else can produce a save the game takes as the creator's.

    node scripts/creator.mjs keygen                 make the key pair (once) and write the public key
    node scripts/creator.mjs sign <save> [out]      sign a save: a .json file, or a sealed .aetheria
                                                    file opened with the key in .env.local

  A signed file opens in any build of the game as a creator save, whatever its numbers.
*/
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { randomBytes } from '@noble/post-quantum/utils.js'

const DIR = path.join(os.homedir(), '.config', 'aetheria')
const KEY_FILE = path.join(DIR, 'creator.key')
const PUBLIC_FILE = new URL('../src/game/creatorKey.js', import.meta.url)
export const CREATOR_PREFIX = 'AEC1.'
const b64 = buf => Buffer.from(buf).toString('base64url')

function keygen() {
  if (fs.existsSync(KEY_FILE)) { console.error(`A key already exists at ${KEY_FILE}. Delete it first to make a new one (old signed saves would stop opening).`); process.exit(1) }
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 })
  const seed = randomBytes(32)
  fs.writeFileSync(KEY_FILE, b64(seed) + '\n', { mode: 0o600 })
  writePublic(ml_dsa65.keygen(seed).publicKey)
  console.log(`Private key saved to ${KEY_FILE} (keep a copy somewhere safe, never in the repository).`)
}

function writePublic(pub) {
  fs.writeFileSync(PUBLIC_FILE, `// The public half of the creator's ML-DSA-65 key (scripts/creator.mjs). It can check a creator\n// save's signature, never make one\nexport const CREATOR_PUBLIC_KEY = '${b64(pub)}'\n`)
  console.log('Public key written to src/game/creatorKey.js')
}

async function readSave(file) {
  const text = fs.readFileSync(file, 'utf8').trim()
  if (text.startsWith('{')) { const d = JSON.parse(text); return d.game === 'aetheria' ? d.save : d }
  // A sealed file: open it with the key of this computer's builds
  const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  process.env.VITE_SAVE_KEY = env.match(/VITE_SAVE_KEY=(.+)/)?.[1]?.trim()
  const { openTransfer } = await import('../src/game/saveFile.js')
  return openTransfer(text)
}

async function sign(file, out) {
  if (!fs.existsSync(KEY_FILE)) { console.error('No creator key yet: run "node scripts/creator.mjs keygen" first.'); process.exit(1) }
  const seed = Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'base64url')
  const { secretKey } = ml_dsa65.keygen(seed)
  const save = await readSave(file)
  save.integrity = { status: 'creator', at: Date.now() }
  const body = zlib.deflateRawSync(Buffer.from(JSON.stringify(save)))
  const sig = ml_dsa65.sign(body, secretKey)
  const target = out || file.replace(/\.(json|aetheria|txt)$/, '') + '.creator.aetheria'
  fs.writeFileSync(target, `${CREATOR_PREFIX}${b64(body)}.${b64(sig)}`)
  console.log(`Signed "${save.name}" → ${target}`)
}

const [cmd, a, b] = process.argv.slice(2)
if (cmd === 'keygen') keygen()
else if (cmd === 'sign' && a) await sign(a, b)
else console.log('Usage: node scripts/creator.mjs keygen | sign <save.json|save.aetheria> [out]')
