/*
  COMPOSER — turns a theme into bars of notes. Pure and deterministic for a given seed, so it can be
  tested and every theme keeps its own recognisable tune.

  A theme is written in a mode over a root, with a progression of scale degrees. Each bar gives:
  - a pad (or organ, or choir) holding the chord, voiced close to the last one so the harmony glides;
  - a bass line, a plucked or arpeggiated accompaniment and percussion, each from a pattern;
  - a melody built from the theme's own motif, in four-bar phrases: the motif, a variation, a
    sequence a step higher and a cadence that comes to rest on the chord.
  Timing and loudness are humanised a little, and an intensity from 0 to 3 decides which layers play.
*/

export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
}

// A seeded random source (mulberry32)
export function rng(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
export const hash = s => [...String(s)].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261)

// Beats in a bar and how a beat divides: 4/4 and 3/4 in eighths, 6/8 as two beats of three
export const METERS = { 4: { beats: 4, sub: 2 }, 3: { beats: 3, sub: 2 }, 6: { beats: 2, sub: 3 } }

/* ---------------- harmony ---------------- */
// The chord on a scale degree (1-7): stacked thirds of the mode, a seventh when asked
export function chordOf(mode, degree, seventh = false) {
  const sc = MODES[mode], i = degree - 1
  const at = k => sc[(i + k) % 7] + 12 * Math.floor((i + k) / 7)
  return seventh ? [at(0), at(2), at(4), at(6)] : [at(0), at(2), at(4)]
}
// The voicing of a chord nearest to the last one, inside a register
export function voiceLead(prev, chord, root, low = 52, high = 70) {
  const pcs = chord.map(n => (root + n) % 12)
  const options = []
  // Every way of putting the chord's notes in the register, close position
  for (let base = low; base <= high; base++) {
    if (!pcs.includes(base % 12)) continue
    const v = [base]
    for (let k = 1; k < pcs.length; k++) {
      const pc = pcs[(pcs.indexOf(base % 12) + k) % pcs.length]
      let n = v[v.length - 1] + 1
      while (n % 12 !== pc) n++
      v.push(n)
    }
    if (v[v.length - 1] <= high + 5) options.push(v)
  }
  if (!prev?.length) return options[Math.floor(options.length / 2)] || pcs.map(p => 60 + p)
  const cost = v => v.reduce((s, n, k) => s + Math.abs(n - (prev[k] ?? prev[prev.length - 1])), 0)
  return options.sort((a, b) => cost(a) - cost(b))[0]
}

/* ---------------- the motif ---------------- */
// Rhythms a motif can take, in sixteenths of the bar, by meter (onset, length)
const RHYTHMS = {
  4: [[[0, 4], [4, 2], [6, 2], [8, 6], [14, 2]], [[0, 3], [3, 1], [4, 4], [8, 4], [12, 4]], [[0, 6], [6, 2], [8, 2], [10, 2], [12, 4]], [[2, 2], [4, 4], [8, 2], [10, 2], [12, 4]]],
  3: [[[0, 4], [4, 2], [6, 2], [8, 4]], [[0, 6], [6, 2], [8, 4]], [[0, 2], [2, 2], [4, 4], [8, 4]]],
  6: [[[0, 4], [4, 2], [6, 4], [10, 2]], [[0, 2], [2, 2], [4, 2], [6, 6]], [[0, 6], [6, 2], [8, 2], [10, 2]]],
}
// A motif: a rhythm and the steps of its contour, fixed for each theme by its name
export function motifFor(id, meter) {
  const r = rng(hash(id) ^ 0x9e3779b9)
  const list = RHYTHMS[meter] || RHYTHMS[4]
  const rhythm = list[Math.floor(r() * list.length)]
  // Mostly steps, a leap now and then, and a shape that rises and falls back
  const steps = rhythm.map((_, i) => (i === 0 ? 0 : r() < 0.25 ? (r() < 0.5 ? -3 : 3) + (r() < 0.5 ? 0 : 1) : r() < 0.55 ? 1 : -1))
  return { rhythm, steps }
}

/* ---------------- patterns ---------------- */
// Accompaniment: which chord tone plays on each sub-beat, or null (by meter)
const ACCOMP = {
  arp: { 4: [0, 1, 2, 1, 3, 1, 2, 1], 3: [0, 1, 2, 1, 2, 1], 6: [0, 1, 2, 3, 2, 1] },
  alberti: { 4: [0, 2, 1, 2, 0, 2, 1, 2], 3: [0, 2, 1, 2, 1, 2], 6: [0, 2, 1, 0, 2, 1] },
  strum: { 4: ['all', null, null, null, 'all', null, 'all', null], 3: ['all', null, 'all', null, 'all', null], 6: ['all', null, null, 'all', null, null] },
  pulse: { 4: [0, 0, 0, 0, 0, 0, 0, 0], 3: [0, 0, 0, 0, 0, 0], 6: [0, 0, 0, 0, 0, 0] },
  sparse: { 4: [0, null, null, null, 2, null, null, null], 3: [0, null, null, null, 1, null], 6: [0, null, null, 2, null, null] },
}
// Bass: semitones over the chord's root on each beat (null rests)
const BASS = {
  root: { 4: [0, null, 7, null], 3: [0, null, null], 6: [0, null] },
  walk: { 4: [0, 7, 12, 7], 3: [0, 7, 12], 6: [0, 7] },
  drone: { 4: [0, null, null, null], 3: [0, null, null], 6: [0, null] },
  pulse: { 4: [0, 0, 0, 0], 3: [0, 0, 0], 6: [0, 0] },
}
// Percussion: [instrument, sub-beat, loudness]; a sub-beat is an eighth in 4/4 and 3/4, a third of a beat in 6/8
const PERC = {
  march: { 4: [['frame', 0, 1], ['frame', 4, 0.7], ['frame', 6, 0.45], ['tamb', 2, 0.35], ['tamb', 6, 0.35]] },
  jig: { 6: [['frame', 0, 1], ['frame', 3, 0.7], ['tamb', 2, 0.5], ['tamb', 5, 0.5], ['shaker', 1, 0.3], ['shaker', 4, 0.3]] },
  waltz: { 3: [['frame', 0, 0.8], ['shaker', 2, 0.35], ['shaker', 4, 0.35]] },
  work: { 4: [['frame', 0, 0.8], ['anvil', 4, 0.35], ['shaker', 2, 0.3], ['shaker', 6, 0.3]] },
  war: { 4: [['timpani', 0, 1], ['frame', 3, 0.6], ['frame', 4, 0.8], ['frame', 6, 0.55], ['frame', 7, 0.4]], 3: [['timpani', 0, 1], ['frame', 2, 0.6], ['frame', 4, 0.6]] },
  heart: { 4: [['frame', 0, 0.55], ['frame', 1, 0.35], ['frame', 4, 0.55], ['frame', 5, 0.35]], 3: [['frame', 0, 0.55], ['frame', 1, 0.35]], 6: [['frame', 0, 0.55], ['frame', 1, 0.35]] },
  soft: { 4: [['shaker', 2, 0.25], ['shaker', 6, 0.25]], 3: [['shaker', 2, 0.25]], 6: [['shaker', 3, 0.25]] },
}

/* ---------------- the composer ---------------- */
// One stream of music for a theme. `bar()` returns the next bar's notes and its length in seconds.
export function createComposer(theme, seed = hash(theme.id)) {
  const r = rng(seed)
  const meter = theme.meter || 4, M = METERS[meter]
  const subs = M.beats * M.sub
  const motif = motifFor(theme.id, meter)
  const scale = MODES[theme.mode]
  const progs = [theme.prog, theme.progB || theme.prog]
  let n = 0, voicing = null, lastLead = theme.lead?.center ?? 72

  // A scale degree near a pitch, and moving along the scale by steps
  const degreeOf = midi => {
    let best = 0, dist = 99
    for (let o = -2; o <= 3; o++) for (let k = 0; k < 7; k++) {
      const m = theme.root + 12 * o + scale[k], d = Math.abs(m - midi)
      if (d < dist) { dist = d; best = o * 7 + k }
    }
    return best
  }
  const midiOf = deg => theme.root + 12 * Math.floor(deg / 7) + scale[((deg % 7) + 7) % 7]

  function bar({ intensity = 2, density = 1, night = false, tempo = 1 } = {}) {
    const bpm = theme.bpm * tempo * (night ? 0.88 : 1)
    const beat = 60 / bpm, sub = beat / M.sub, len = beat * M.beats
    const section = Math.floor(n / 8) % 2
    const prog = progs[section]
    const [deg, seventh] = prog[n % prog.length]
    const chord = chordOf(theme.mode, deg, !!seventh)
    const rootMidi = theme.root + chord[0]
    const events = []
    const human = () => (r() - 0.5) * 0.018
    const vel = (v = 1) => v * (0.84 + r() * 0.16)
    const swing = i => (theme.swing && meter !== 6 && i % 2 ? sub * theme.swing * 0.33 : 0)
    const phrase = n % 4

    // The pad holds the chord, voiced near the last one
    voicing = voiceLead(voicing, chord, theme.root, theme.padLow ?? 52, theme.padHigh ?? 70)
    if (theme.pad) for (const m of voicing) events.push({ part: 'pad', instr: theme.pad, midi: m, t: 0, dur: len * 1.02, vel: 0.55, pan: (m % 7) / 7 - 0.5 })

    // The bass
    if (theme.bass) {
      const pat = BASS[theme.bass.pattern || 'root'][meter] || BASS.root[4]
      pat.forEach((iv, b) => {
        if (iv === null) return
        // Walking basses pass through the scale on their way to the next chord
        const m = rootMidi - 24 + iv + (theme.bass.pattern === 'walk' && b === pat.length - 1 && r() < 0.5 ? -1 : 0)
        events.push({ part: 'bass', instr: theme.bass.instr || 'bass', midi: m, t: b * beat + human(), dur: beat * (theme.bass.pattern === 'drone' ? M.beats : 1.1), vel: vel(b ? 0.75 : 1), pan: 0 })
      })
    }

    // The accompaniment: from intensity 1
    if (theme.accomp && intensity >= 1) {
      const pat = ACCOMP[theme.accomp.pattern][meter] || ACCOMP[theme.accomp.pattern][4]
      const tones = [...voicing, voicing[0] + 12]
      const step = subs / pat.length
      pat.forEach((k, i) => {
        if (k === null || (theme.accomp.thin && i % 2 && r() < 0.4)) return
        const at = i * step * sub + swing(i) + human()
        if (k === 'all') tones.slice(0, 3).forEach((m, j) => events.push({ part: 'accomp', instr: theme.accomp.instr, midi: m + (theme.accomp.octave || 0), t: at + j * 0.012, dur: sub * 3, vel: vel(0.6), pan: -0.3 + j * 0.15 }))
        else events.push({ part: 'accomp', instr: theme.accomp.instr, midi: tones[k % tones.length] + (theme.accomp.octave || 0), t: at, dur: sub * 2.5, vel: vel(i === 0 ? 0.75 : 0.55), pan: -0.25 })
      })
    }

    // The melody: from intensity 2, phrased in fours, resting on the second half of a section now and then
    const leadRests = section === 1 && (n % 8 === 5 || n % 8 === 6) && r() < 0.6
    if (theme.lead && intensity >= 2 && !leadRests && r() < Math.min(1, 0.55 + 0.45 * density)) {
      const shift = phrase === 2 ? 1 : 0 // the sequence, a step higher
      let d = degreeOf(lastLead)
      // Each phrase starts on a note of the chord near where the last one ended
      if (phrase === 0 || phrase === 2) {
        const targets = chord.map(c => degreeOf(theme.root + c + 12 * Math.round((lastLead - theme.root - c) / 12)))
        d = targets.sort((a, b) => Math.abs(a - d) - Math.abs(b - d))[0] + shift
      }
      const rhythm = phrase === 3 ? [[0, 4], [4, 4], [8, 8]].map(([o, l]) => [Math.round((o * subs) / 16), Math.round((l * subs) / 16)]) : motif.rhythm.map(([o, l]) => [(o * subs) / 16, (l * subs) / 16])
      const steps = phrase === 1 ? motif.steps.map((s, i) => (i === motif.steps.length - 1 ? -s : s)) : phrase === 3 ? [0, -1, -1] : motif.steps
      rhythm.forEach(([o, l], i) => {
        d += steps[i] || 0
        let m = midiOf(d)
        // Strong beats land on the chord
        if (o === 0) {
          const pcs = chord.map(c => (theme.root + c) % 12)
          if (!pcs.includes(m % 12)) { d += pcs.includes(midiOf(d + 1) % 12) ? 1 : -1; m = midiOf(d) }
        }
        // Keep to the instrument's range by turning back step by step, never by jumping an octave
        const lo = (theme.lead.center ?? 72) - 10, hi = (theme.lead.center ?? 72) + 10
        while (m > hi) { d -= 1; m = midiOf(d) }
        while (m < lo) { d += 1; m = midiOf(d) }
        // And never leap further than a major sixth from the last note
        while (m - lastLead > 9) { d -= 1; m = midiOf(d) }
        while (lastLead - m > 9) { d += 1; m = midiOf(d) }
        // The cadence ends on the chord's root or third, long
        if (phrase === 3 && i === rhythm.length - 1) {
          // The cadence rests on a note of the chord, the nearest to the last note that fits the range
          // (the root is preferred, then the third, then the fifth when the others are out of reach)
          const pcs = chord.slice(0, 3).map(c => (theme.root + c) % 12)
          const cands = []
          for (let x = lo; x <= hi; x++) { const k = pcs.indexOf(x % 12); if (k >= 0) cands.push([x, Math.abs(x - lastLead) + k * 2]) }
          if (cands.length) m = cands.sort((a, b) => a[1] - b[1])[0][0]
          d = degreeOf(m)
        }
        events.push({ part: 'lead', instr: theme.lead.instr, midi: m, t: o * sub + swing(o) + human(), dur: Math.max(sub, l * sub * 0.95), vel: vel(o === 0 ? 0.95 : 0.78), pan: 0.15 })
        lastLead = m
      })
    }

    // Percussion: the theme's drums from intensity 3, its softer pulse from intensity 1
    const percStyle = intensity >= 3 ? theme.perc : intensity >= 1 ? theme.percLow : null
    const perc = percStyle && (PERC[percStyle]?.[meter] || PERC[percStyle]?.[4])
    if (perc) for (const [instr, s, v] of perc) {
      const at = (s % subs) * sub
      events.push({ part: 'perc', instr, midi: instr === 'timpani' ? rootMidi - 24 : 60, t: at + swing(s) + human(), dur: 0.6, vel: vel(v), pan: instr === 'tamb' ? 0.35 : instr === 'shaker' ? -0.35 : 0 })
    }

    n++
    return { events, len, chord: chord.map(c => theme.root + c), bar: n - 1 }
  }
  return { bar, get index() { return n }, theme }
}
