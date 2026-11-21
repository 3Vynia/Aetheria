import { CREATOR_PUBLIC_KEY } from './creatorKey.js'
import { fromB64Url } from './vault.js'

/*
  Creator saves: made and signed on the creator's computer with scripts/creator.mjs (ML-DSA-65, a
  post-quantum signature). The game holds only the public key, so it can tell such a save is genuine
  but nobody can make one. A genuine creator save skips the review of plausibility.js.
  Format: "AEC1." + base64url(deflated JSON) + "." + base64url(signature)
*/
export const CREATOR_PREFIX = 'AEC1.'
export const isCreatorCode = str => typeof str === 'string' && str.startsWith(CREATOR_PREFIX)

export async function openCreator(str) {
  const [body, sig] = str.slice(CREATOR_PREFIX.length).split('.')
  let ok = false, bytes
  try {
    bytes = fromB64Url(body)
    // The signature library is only fetched when a creator save is opened
    const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js')
    ok = ml_dsa65.verify(fromB64Url(sig), bytes, fromB64Url(CREATOR_PUBLIC_KEY))
  } catch { ok = false }
  if (!ok) throw new Error('tampered')
  const json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text()
  const save = JSON.parse(json)
  save.integrity = { status: 'creator', at: Date.now() }
  return save
}
