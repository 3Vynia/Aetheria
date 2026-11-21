/*
  INSTRUMENTS — how each part of a theme is played on a WebAudio context.
  Plucked, struck and percussive sounds are rendered once per note (audio/dsp.js) and played back
  from a buffer. Sustained sounds (strings, choir, organ, flute, horn) are built live, with their own
  envelopes, filters and a delayed vibrato, because they need to swell and breathe.
  `playNote(graph, event, at, palette)` is the one entry point; a graph is what mixer.js builds.
*/
import { pluckString, fmBell, frameDrum, tambourine, shaker, timpani, anvil, swell } from './dsp.js'

const hz = m => 440 * 2 ** ((m - 69) / 12)

// How loud each instrument sits in the mix, and how much of it goes to the room
export const MIX = {
  strings: { level: 0.15, send: 0.7, pan: -0.15 }, choir: { level: 0.13, send: 0.85, pan: 0.1 }, organ: { level: 0.1, send: 0.75, pan: 0 },
  warm: { level: 0.14, send: 0.55, pan: 0 }, flute: { level: 0.22, send: 0.55, pan: 0.2 }, horn: { level: 0.16, send: 0.6, pan: -0.1 },
  cello: { level: 0.2, send: 0.35, pan: -0.25 }, deep: { level: 0.3, send: 0.15, pan: 0 }, bass: { level: 0.4, send: 0.15, pan: 0 },
  lute: { level: 0.3, send: 0.35, pan: -0.3 }, harp: { level: 0.32, send: 0.6, pan: 0.3 }, pizz: { level: 0.3, send: 0.35, pan: -0.2 },
  bell: { level: 0.17, send: 0.7, pan: 0.25 }, celesta: { level: 0.16, send: 0.6, pan: 0.3 },
  frame: { level: 0.42, send: 0.25, pan: 0 }, tamb: { level: 0.13, send: 0.3, pan: 0.35 }, shaker: { level: 0.1, send: 0.2, pan: -0.35 },
  timpani: { level: 0.42, send: 0.45, pan: 0 }, anvil: { level: 0.08, send: 0.4, pan: 0.4 }, swell: { level: 0.2, send: 0.6, pan: 0 },
  chip: { level: 0.06, send: 0.12, pan: 0 },
}
const SAMPLED = new Set(['lute', 'harp', 'pizz', 'bass', 'bell', 'celesta', 'frame', 'tamb', 'shaker', 'timpani', 'anvil', 'swell'])
const DRUMS = new Set(['frame', 'tamb', 'shaker', 'timpani', 'anvil', 'swell'])

/* ---------------- rendered notes, kept per context ---------------- */
const caches = new WeakMap()
function bufferFor(ctx, instr, midi) {
  let cache = caches.get(ctx)
  if (!cache) caches.set(ctx, (cache = new Map()))
  const key = instr + ':' + (DRUMS.has(instr) && instr !== 'timpani' ? 0 : midi)
  let buf = cache.get(key)
  if (buf) return buf
  const sr = ctx.sampleRate, f = hz(midi)
  let data
  switch (instr) {
    case 'lute': data = pluckString(f, sr, { dur: 2.2, decay: 0.9962, bright: 0.6, pick: 0.16, body: 0.35 }); break
    case 'harp': data = pluckString(f, sr, { dur: 3.4, decay: 0.9984, bright: 0.38, pick: 0.45, body: 0.08 }); break
    case 'pizz': data = pluckString(f, sr, { dur: 0.7, decay: 0.989, bright: 0.45, pick: 0.25, body: 0.3 }); break
    case 'bass': data = pluckString(f, sr, { dur: 2.2, decay: 0.9975, bright: 0.28, pick: 0.3, body: 0.4 }); break
    case 'bell': data = fmBell(f, sr, { dur: 3.2, ratio: 3.5, index: 2.2, decay: 1.3 }); break
    case 'celesta': data = fmBell(f, sr, { dur: 2.4, ratio: 1.4, index: 1.1, decay: 2.1, partial: 0.08 }); break
    case 'frame': data = frameDrum(sr); break
    case 'tamb': data = tambourine(sr); break
    case 'shaker': data = shaker(sr); break
    case 'timpani': data = timpani(f, sr); break
    case 'anvil': data = anvil(sr); break
    case 'swell': data = swell(sr); break
    default: return null
  }
  buf = ctx.createBuffer(1, data.length, sr)
  buf.getChannelData(0).set(data)
  cache.set(key, buf)
  return buf
}
// Render the notes a theme will need before it plays, so the first bars never stutter
// Render the notes a theme will need, a few at a time while the page is idle, so the first bars never
// stutter and switching screens never stalls the game; a note needed sooner is rendered on the spot
const queues = new WeakMap()
export function warmUp(ctx, notes, now = false) {
  const todo = notes.filter(([instr]) => SAMPLED.has(instr))
  if (now || typeof setTimeout === 'undefined') { for (const [instr, midi] of todo) bufferFor(ctx, instr, midi); return }
  let q = queues.get(ctx)
  if (!q) queues.set(ctx, (q = []))
  const idle = q.length === 0
  q.push(...todo)
  if (!idle) return
  const step = () => {
    const until = Date.now() + 6
    while (q.length && Date.now() < until) { const [instr, midi] = q.shift(); bufferFor(ctx, instr, midi) }
    if (q.length) setTimeout(step, 16)
  }
  setTimeout(step, 0)
}

/* ---------------- wave shapes for the live instruments ---------------- */
const waves = new WeakMap()
function wave(ctx, name) {
  let w = waves.get(ctx)
  if (!w) waves.set(ctx, (w = {}))
  if (w[name]) return w[name]
  const H = {
    organ: [0, 1, 0.62, 0.38, 0.26, 0.05, 0.14, 0, 0.08],
    flute: [0, 1, 0.22, 0.07, 0.03],
    warm: [0, 1, 0.3, 0.12, 0.05, 0.02],
  }[name]
  const real = new Float32Array(H.length), imag = Float32Array.from(H)
  return (w[name] = ctx.createPeriodicWave(real, imag))
}

/* ---------------- one note ---------------- */
// The channel a note goes out on: its level, its place in the stereo field and its share of the room
function outlet(g, instr, vel, pan, at, end) {
  const ctx = g.ctx, mix = MIX[instr] || MIX.warm
  const amp = ctx.createGain()
  amp.gain.value = mix.level * vel
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null
  const send = ctx.createGain()
  send.gain.value = mix.send * g.roomWet
  if (panner) { panner.pan.value = Math.max(-1, Math.min(1, mix.pan + pan * 0.6)); amp.connect(panner); panner.connect(g.music); panner.connect(send) }
  else { amp.connect(g.music); amp.connect(send) }
  send.connect(g.reverbIn)
  const nodes = [amp, send, ...(panner ? [panner] : [])]
  return { amp, nodes, done: () => nodes.forEach(n => n.disconnect()), end }
}

function playSampled(g, ev, at) {
  const ctx = g.ctx, buf = bufferFor(ctx, ev.instr, ev.midi)
  if (!buf) return
  const src = ctx.createBufferSource()
  src.buffer = buf
  // Drums are rendered once and pitched a touch so repeats never sound identical
  if (DRUMS.has(ev.instr) && ev.instr !== 'timpani') src.playbackRate.value = 1 + (ev.midi - 60) * 0.004 + (Math.random() - 0.5) * 0.03
  const out = outlet(g, ev.instr, ev.vel, ev.pan || 0, at)
  src.connect(out.amp)
  // Plucked notes ring out; a held note is damped softly when it ends
  const ring = DRUMS.has(ev.instr) ? buf.duration : Math.min(buf.duration, Math.max(ev.dur * 1.6, 0.4))
  out.amp.gain.setValueAtTime(out.amp.gain.value, at + ring - 0.08)
  out.amp.gain.linearRampToValueAtTime(0, at + ring)
  src.onended = () => { src.disconnect(); out.done() }
  src.start(at)
  src.stop(at + ring + 0.02)
}

// Attack, decay to a sustain, release: a smooth shape for held notes
function adsr(param, at, dur, { a, d = 0.2, s = 0.8, r }, peak = 1) {
  param.setValueAtTime(0.0001, at)
  param.linearRampToValueAtTime(peak, at + a)
  param.setTargetAtTime(peak * s, at + a, d / 3)
  param.setValueAtTime(peak * s, at + Math.max(a, dur))
  param.setTargetAtTime(0.0001, at + Math.max(a, dur), r / 4)
}
// Vibrato that only starts once the note has settled, as a player would
function vibrato(ctx, osc, at, cents, rate = 5.2, delay = 0.35) {
  const lfo = ctx.createOscillator(), depth = ctx.createGain()
  lfo.frequency.value = rate * (0.95 + Math.random() * 0.1)
  depth.gain.setValueAtTime(0, at)
  depth.gain.linearRampToValueAtTime(cents, at + delay + 0.4)
  lfo.connect(depth)
  for (const o of [].concat(osc)) depth.connect(o.detune)
  return { lfo, depth }
}

function playLive(g, ev, at, held) {
  const ctx = g.ctx, f = hz(ev.midi), dur = ev.dur
  const out = outlet(g, ev.instr, ev.vel, ev.pan || 0, at)
  const env = ctx.createGain()
  const filt = ctx.createBiquadFilter()
  filt.type = 'lowpass'
  env.connect(out.amp)
  filt.connect(env)
  const oscs = [], extra = []
  const osc = (type, detune = 0, freq = f) => { const o = ctx.createOscillator(); if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type); o.frequency.value = freq; o.detune.value = detune; oscs.push(o); return o }
  let rel = 0.6
  switch (ev.instr) {
    case 'strings': {
      // Three bows, a little apart, through a filter that opens as the note swells
      for (const d of [-9, 0, 8]) osc('sawtooth', d + (Math.random() - 0.5) * 3).connect(filt)
      const pad = held === 'pad'
      filt.Q.value = 0.5
      filt.frequency.setValueAtTime(pad ? g.bright * 0.45 : 900, at)
      filt.frequency.linearRampToValueAtTime(pad ? g.bright : 2600, at + (pad ? 1.2 : 0.25))
      adsr(env.gain, at, dur, pad ? { a: 0.9, d: 0.8, s: 0.85, r: 1.4 } : { a: 0.09, d: 0.3, s: 0.8, r: 0.5 })
      rel = pad ? 1.4 : 0.5
      if (!pad) extra.push(vibrato(ctx, oscs, at, 9))
      break
    }
    case 'choir': {
      // Voices on an "ah": two detuned saws through the vowel's three formants
      const bank = [[730, 1, 9], [1090, 0.5, 11], [2440, 0.25, 14]].map(([fr, gain, q]) => {
        const bp = ctx.createBiquadFilter(), bg = ctx.createGain()
        bp.type = 'bandpass'; bp.frequency.value = fr * (ev.midi > 66 ? 1.08 : 1); bp.Q.value = q; bg.gain.value = gain * 3.2
        bp.connect(bg).connect(filt); extra.push({ node: bp }, { node: bg }); return bp
      })
      for (const d of [-7, 6]) { const o = osc('sawtooth', d); bank.forEach(b => o.connect(b)) }
      filt.frequency.value = 5000
      const pad = held === 'pad'
      adsr(env.gain, at, dur, pad ? { a: 1.1, d: 0.6, s: 0.9, r: 1.6 } : { a: 0.15, d: 0.3, s: 0.85, r: 0.7 })
      rel = pad ? 1.6 : 0.7
      extra.push(vibrato(ctx, oscs, at, pad ? 5 : 10, 4.8, pad ? 0.8 : 0.3))
      break
    }
    case 'organ': {
      osc(wave(ctx, 'organ')).connect(filt); osc(wave(ctx, 'organ'), 4, f * 2).connect(filt)
      filt.frequency.value = 4200
      adsr(env.gain, at, dur, { a: 0.06, d: 0.2, s: 0.92, r: 0.45 })
      rel = 0.45
      break
    }
    case 'warm': {
      osc(wave(ctx, 'warm'), -5).connect(filt); osc(wave(ctx, 'warm'), 5).connect(filt); osc('sine', 0, f / 2).connect(filt)
      filt.frequency.value = Math.min(2400, g.bright)
      adsr(env.gain, at, dur, { a: 0.7, d: 0.6, s: 0.85, r: 1.2 })
      rel = 1.2
      break
    }
    case 'flute': {
      osc(wave(ctx, 'flute')).connect(filt)
      filt.frequency.value = 6000
      // The breath: a little noise tuned near the note, mostly at the start
      const n = ctx.createBufferSource(), nb = ctx.createBiquadFilter(), ng = ctx.createGain()
      n.buffer = g.noise; n.loop = true
      nb.type = 'bandpass'; nb.frequency.value = f * 2; nb.Q.value = 6
      ng.gain.setValueAtTime(0.0001, at); ng.gain.linearRampToValueAtTime(0.35, at + 0.04); ng.gain.setTargetAtTime(0.08, at + 0.06, 0.08)
      n.connect(nb).connect(ng).connect(env)
      extra.push({ node: nb }, { node: ng }, { src: n })
      adsr(env.gain, at, dur, { a: 0.07, d: 0.25, s: 0.82, r: 0.25 })
      rel = 0.3
      extra.push(vibrato(ctx, oscs, at, 12, 5.4))
      break
    }
    case 'horn': {
      // Brass: a bright attack that settles, through a filter that follows the breath
      for (const d of [-4, 4]) osc('sawtooth', d).connect(filt)
      filt.Q.value = 0.9
      filt.frequency.setValueAtTime(500, at)
      filt.frequency.linearRampToValueAtTime(Math.min(3200, f * 6), at + 0.1)
      filt.frequency.setTargetAtTime(Math.min(2000, f * 4), at + 0.12, 0.3)
      adsr(env.gain, at, dur, { a: 0.07, d: 0.3, s: 0.8, r: 0.35 })
      rel = 0.35
      extra.push(vibrato(ctx, oscs, at, 7, 5))
      break
    }
    case 'cello': {
      for (const d of [-5, 5]) osc('sawtooth', d).connect(filt)
      filt.frequency.value = Math.min(1400, f * 7); filt.Q.value = 0.6
      adsr(env.gain, at, dur, { a: 0.12, d: 0.3, s: 0.8, r: 0.4 })
      rel = 0.4
      break
    }
    case 'deep': {
      osc('sine').connect(filt); osc('triangle', 0, f * 2).connect(filt)
      filt.frequency.value = 420
      adsr(env.gain, at, dur, { a: 0.25, d: 0.4, s: 0.85, r: 0.8 })
      rel = 0.8
      break
    }
    case 'chip': default: {
      osc('square').connect(filt)
      filt.frequency.value = 3200
      adsr(env.gain, at, Math.min(dur, 0.6), { a: 0.005, d: 0.1, s: 0.6, r: 0.12 })
      rel = 0.12
    }
  }
  const stop = at + dur + rel + 0.1
  for (const o of oscs) { o.start(at); o.stop(stop) }
  for (const x of extra) {
    if (x.lfo) { x.lfo.start(at); x.lfo.stop(stop) }
    if (x.src) { x.src.start(at, Math.random()); x.src.stop(stop) }
  }
  oscs[0].onended = () => {
    oscs.forEach(o => o.disconnect()); filt.disconnect(); env.disconnect()
    extra.forEach(x => { x.lfo?.disconnect(); x.depth?.disconnect(); x.node?.disconnect(); x.src?.disconnect() })
    out.done()
  }
}

// The palette swaps who plays: the harp palette gives melodies and chords to plucked strings, the retro
// one to a chip voice
function remap(instr, part, palette) {
  if (palette === 'retro' && !DRUMS.has(instr)) return 'chip'
  if (palette === 'harp') {
    if (part === 'lead' && !['bell', 'celesta'].includes(instr)) return 'harp'
    if (part === 'accomp') return instr === 'celesta' || instr === 'bell' ? instr : 'harp'
  }
  return instr
}

export function playNote(g, ev, at, palette = 'soft') {
  const instr = remap(ev.instr, ev.part, palette)
  const e = instr === ev.instr ? ev : { ...ev, instr }
  if (SAMPLED.has(instr)) playSampled(g, e, at)
  else playLive(g, e, at, ev.part)
}
