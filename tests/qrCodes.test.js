import { describe, it, expect } from 'vitest'
import encodeQR from 'qr'
import decodeQR from 'qr/decode.js'
import { splitCode, collector, readPart, PART } from '../src/game/qrCodes.js'
import { encodeCode, decodeAny } from '../src/game/transfer.js'
import { state, newHero } from './helpers.js'

const big = 'AE2.' + 'xyz0123456789-_'.repeat(900)

describe('a game carried in QR codes', () => {
  it('is cut into parts that come back together in any order, with repeats', () => {
    const parts = splitCode(big)
    expect(parts.length).toBe(Math.ceil(big.length / PART))
    const col = collector()
    const shuffled = [...parts].reverse()
    let s
    for (const p of [shuffled[0], ...shuffled, shuffled[3]]) s = col.add(p)
    expect(s.done).toBe(true)
    expect(s.code).toBe(big)
  })

  it('says which parts are still missing', () => {
    const parts = splitCode(big)
    const col = collector()
    parts.slice(1).forEach(p => col.add(p))
    const s = col.state()
    expect(s.done).toBe(false)
    expect(s.missing).toEqual([0])
    expect(s.have).toBe(parts.length - 1)
  })

  it('keeps a long scan when a code from another run passes by', () => {
    const a = splitCode(big)
    const b = splitCode(big + 'other')
    const col = collector()
    a.slice(0, 3).forEach(p => col.add(p))
    col.add(b[0])
    a.slice(3).forEach(p => col.add(p))
    expect(col.state().code).toBe(big)
  })

  it('moves on to the new codes when the sender makes them again', () => {
    let t = 0
    const col = collector(() => t)
    const old = splitCode(big)
    old.slice(0, 4).forEach(p => col.add(p))
    t = 10_000
    const fresh = splitCode(big + 'later')
    fresh.forEach(p => col.add(p))
    expect(col.state().code).toBe(big + 'later')
  })

  it('takes a whole code read from a single QR', () => {
    expect(collector().add('AE2.' + 'q'.repeat(40))).toMatchObject({ done: true })
    expect(readPart('hello')).toBe(null)
  })

  it('survives being drawn as QR codes and read back', async () => {
    newHero({ name: 'Qira' })
    const code = await encodeCode(JSON.parse(JSON.stringify(state)))
    const col = collector()
    for (const p of splitCode(code)) {
      const m = encodeQR(p, 'raw', { ecc: 'low', border: 4 })
      const s = 3, w = m.length * s, data = new Uint8ClampedArray(w * w * 4).fill(255)
      for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (m[(y / s) | 0][(x / s) | 0]) { const o = (y * w + x) * 4; data[o] = data[o + 1] = data[o + 2] = 0 }
      col.add(decodeQR({ width: w, height: w, data }))
    }
    expect(col.state().done).toBe(true)
    expect((await decodeAny(col.state().code)).name).toBe('Qira')
  })
})
