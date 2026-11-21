import { describe, it, expect } from 'vitest'
import { THEMES } from '../src/game/data/audio.js'
import { createComposer, chordOf, voiceLead, MODES } from '../src/game/audio/composer.js'
import { pluckString, fmBell, frameDrum, roomImpulse } from '../src/game/audio/dsp.js'

// Sixteen bars of a theme, at full intensity
const play = (th, bars = 16, o = {}) => { const c = createComposer(th); return Array.from({ length: bars }, () => c.bar({ intensity: 3, ...o })) }

describe('the composer', () => {
  it('writes every theme the same way each time, inside its bars', () => {
    for (const th of Object.values(THEMES)) {
      const a = play(th, 8), b = play(th, 8)
      expect(a.map(x => x.events.length)).toEqual(b.map(x => x.events.length))
      for (const { events, len } of a) for (const e of events) {
        expect(Number.isFinite(e.midi) && Number.isFinite(e.t) && Number.isFinite(e.dur), th.id).toBe(true)
        expect(e.t, th.id).toBeGreaterThan(-0.05)
        expect(e.t, th.id).toBeLessThan(len)
        expect(['pad', 'bass', 'accomp', 'lead', 'perc']).toContain(e.part)
      }
    }
  })

  it('keeps melodies singable: in the theme’s range, by step and in the key', () => {
    for (const th of Object.values(THEMES)) {
      if (!th.lead) continue
      const scale = MODES[th.mode].map(n => (th.root + n) % 12)
      const lead = play(th, 32).flatMap(b => b.events.filter(e => e.part === 'lead')).map(e => e.midi)
      expect(lead.length, th.id).toBeGreaterThan(20)
      for (let i = 1; i < lead.length; i++) expect(Math.abs(lead[i] - lead[i - 1]), th.id).toBeLessThanOrEqual(9)
      expect(lead.every(m => scale.includes(m % 12)), th.id).toBe(true)
      const c = th.lead.center ?? 72
      expect(Math.min(...lead), th.id).toBeGreaterThanOrEqual(c - 12)
      expect(Math.max(...lead), th.id).toBeLessThanOrEqual(c + 12)
    }
  })

  it('adds layers with the intensity: pads first, drums last', () => {
    const th = THEMES.adventure
    const parts = i => new Set(play(th, 8, { intensity: i }).flatMap(b => b.events.map(e => e.part)))
    expect([...parts(0)].sort()).toEqual(['bass', 'pad'])
    expect(parts(1).has('accomp')).toBe(true)
    expect(parts(1).has('lead')).toBe(false)
    expect(parts(2).has('lead')).toBe(true)
    expect(parts(3).has('perc')).toBe(true)
  })

  it('moves the harmony smoothly from chord to chord', () => {
    const th = THEMES.calm
    let prev = null, total = 0
    for (const [d] of [...th.prog, ...th.prog]) {
      const v = voiceLead(prev, chordOf(th.mode, d), th.root)
      if (prev) total += v.reduce((s, n, k) => s + Math.abs(n - prev[k]), 0)
      prev = v
    }
    // Close voicing: on average each voice moves no more than a few semitones
    expect(total / (th.prog.length * 2 - 1) / 3).toBeLessThan(4)
  })

  it('slows down at night and with the tempo setting', () => {
    const [day] = play(THEMES.hero, 1), [night] = play(THEMES.hero, 1, { night: true }), [slow] = play(THEMES.hero, 1, { tempo: 0.8 })
    expect(night.len).toBeGreaterThan(day.len)
    expect(slow.len).toBeGreaterThan(day.len)
  })
})

describe('instruments and rooms', () => {
  it('render clean sound that fades away', () => {
    const sr = 22050
    for (const d of [pluckString(220, sr), fmBell(880, sr), frameDrum(sr), ...roomImpulse(sr, { decay: 1.5 })]) {
      expect(d.every(Number.isFinite)).toBe(true)
      const peak = d.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
      expect(peak).toBeGreaterThan(0.5)
      expect(peak).toBeLessThanOrEqual(1)
      const end = d.slice(-Math.floor(d.length / 10)).reduce((m, v) => Math.max(m, Math.abs(v)), 0)
      expect(end).toBeLessThan(peak * 0.2)
    }
  })
})
