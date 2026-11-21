/*
  DSP: instruments and rooms rendered into plain sample arrays. Nothing here touches WebAudio, so it
  runs the same in the browser and in tests. music.js copies these into AudioBuffers once per note and
  plays them back, which keeps the sound rich and the cost of every note tiny.
*/

const TAU = Math.PI * 2

// A small deterministic noise source, so a rendered note always sounds the same
export function noiseGen(seed = 1) {
  let s = seed >>> 0 || 1
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296) * 2 - 1 }
}

// A biquad filter for offline rendering (RBJ cookbook)
export function biquad(type, freq, q, sr) {
  const w = TAU * Math.min(freq, sr * 0.49) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q)
  let b0, b1, b2, a0, a1, a2
  if (type === 'lowpass') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al }
  else if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al }
  else { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al } // bandpass
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  return x => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y }
}

// Peak-normalise to a target, so every instrument leaves the renderer at the same level
function normalise(d, peak = 0.9) {
  let m = 0
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]))
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m
  return d
}
// A short fade at the end so a note never clicks when it stops
function tail(d, sr, ms = 30) {
  const n = Math.min(d.length, Math.round((sr * ms) / 1000))
  for (let i = 0; i < n; i++) d[d.length - 1 - i] *= i / n
  return d
}

/* ---------------- plucked strings (Karplus-Strong, with tuning, pick position and body) ---------------- */
// bright: how much treble the pluck starts with · decay: how long it rings · body: a soft wooden resonance
export function pluckString(freq, sr, { dur = 2.4, decay = 0.9965, bright = 0.55, pick = 0.18, body = 0.25, seed = 7 } = {}) {
  const n = Math.round(sr * dur), out = new Float32Array(n)
  const period = sr / freq, N = Math.floor(period), frac = period - N
  const buf = new Float32Array(N)
  const rnd = noiseGen(seed + Math.round(freq))
  // The excitation: noise softened by the brightness, with the pick position notching its harmonics
  const lp = biquad('lowpass', 800 + bright * 9000, 0.7, sr)
  const raw = new Float32Array(N)
  for (let i = 0; i < N; i++) raw[i] = lp(rnd())
  const pd = Math.max(1, Math.round(pick * N))
  for (let i = 0; i < N; i++) buf[i] = raw[i] - (i >= pd ? raw[i - pd] : 0) * 0.8
  // The loop: an averaging filter (the string's damping) and an allpass for the fractional part of the period
  const c = (1 - frac) / (1 + frac)
  let idx = 0, apX = 0, apY = 0
  for (let i = 0; i < n; i++) {
    const avg = decay * 0.5 * (buf[idx] + buf[(idx + 1) % N])
    const y = c * avg + apX - c * apY
    apX = avg; apY = y
    buf[idx] = y
    out[i] = y
    idx = (idx + 1) % N
  }
  // The body: two soft resonances of a wooden box under the string
  if (body > 0) {
    const r1 = biquad('bandpass', 180, 2, sr), r2 = biquad('bandpass', 420, 2.5, sr)
    for (let i = 0; i < n; i++) out[i] += body * (r1(out[i]) + 0.6 * r2(out[i]))
  }
  return tail(normalise(out), sr)
}

/* ---------------- bells, celesta and glass (FM) ---------------- */
// ratio: modulator to carrier (3.5 bell, 1.4 celesta) · index: how metallic the strike is
export function fmBell(freq, sr, { dur = 3, ratio = 3.5, index = 2.4, decay = 1.6, partial = 0.18 } = {}) {
  const n = Math.round(sr * dur), out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const env = Math.exp(-t * decay) * Math.min(1, t * 600)
    const I = index * Math.exp(-t * decay * 2.2)
    const s = Math.sin(TAU * freq * t + I * Math.sin(TAU * freq * ratio * t))
    // A quieter upper partial gives the strike its shimmer
    const up = Math.sin(TAU * freq * 2.76 * t) * Math.exp(-t * decay * 3)
    out[i] = (s + partial * up) * env
  }
  return tail(normalise(out, 0.85), sr)
}

/* ---------------- percussion ---------------- */
// A frame drum: a falling membrane tone and the slap of the hand
export function frameDrum(sr, { pitch = 92, dur = 0.9, slap = 0.35, seed = 3 } = {}) {
  const n = Math.round(sr * dur), out = new Float32Array(n), rnd = noiseGen(seed)
  const bp = biquad('bandpass', 900, 0.9, sr)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const f = pitch * (1 + 0.9 * Math.exp(-t * 28))
    ph += (TAU * f) / sr
    const body = Math.sin(ph) * Math.exp(-t * 6.5)
    const hand = bp(rnd()) * Math.exp(-t * 55) * slap
    out[i] = body + hand
  }
  return tail(normalise(out), sr)
}
// A tambourine: a hit of noise through the ring of the jingles
export function tambourine(sr, { dur = 0.45, seed = 11 } = {}) {
  const n = Math.round(sr * dur), out = new Float32Array(n), rnd = noiseGen(seed)
  const j = [biquad('bandpass', 6200, 9, sr), biquad('bandpass', 7900, 11, sr), biquad('bandpass', 9800, 12, sr)]
  const hp = biquad('highpass', 4000, 0.7, sr)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const x = hp(rnd()) * (Math.exp(-t * 18) + 0.25 * Math.exp(-t * 60))
    out[i] = j[0](x) + j[1](x) + j[2](x) + x * 0.15
  }
  return tail(normalise(out, 0.7), sr)
}
// A shaker: a short swell of fine grains
export function shaker(sr, { dur = 0.16, seed = 19 } = {}) {
  const n = Math.round(sr * dur), out = new Float32Array(n), rnd = noiseGen(seed)
  const hp = biquad('highpass', 5200, 0.8, sr)
  for (let i = 0; i < n; i++) { const t = i / dur / sr; out[i] = hp(rnd()) * Math.sin(Math.PI * Math.min(1, t)) ** 2 }
  return tail(normalise(out, 0.6), sr)
}
// A timpani: inharmonic partials of a big kettle, struck with a soft mallet
export function timpani(freq, sr, { dur = 2.6, seed = 23 } = {}) {
  const n = Math.round(sr * dur), out = new Float32Array(n), rnd = noiseGen(seed)
  const parts = [[1, 1, 2.2], [1.5, 0.5, 3], [1.98, 0.3, 4], [2.44, 0.18, 5.5]]
  const lp = biquad('lowpass', 500, 0.7, sr)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    let s = 0
    for (const [r, a, d] of parts) s += a * Math.sin(TAU * freq * r * t) * Math.exp(-t * d)
    out[i] = s * Math.min(1, t * 300) + lp(rnd()) * Math.exp(-t * 40) * 0.4
  }
  return tail(normalise(out), sr)
}
// An anvil: a bright, inharmonic strike for the workshop
export function anvil(sr, { freq = 1250, dur = 1.4 } = {}) {
  const n = Math.round(sr * dur), out = new Float32Array(n)
  const parts = [[1, 1, 4], [2.32, 0.6, 6], [3.86, 0.35, 8], [5.41, 0.2, 11]]
  for (let i = 0; i < n; i++) {
    const t = i / sr
    let s = 0
    for (const [r, a, d] of parts) s += a * Math.sin(TAU * freq * r * t) * Math.exp(-t * d)
    out[i] = s * Math.min(1, t * 2000)
  }
  return tail(normalise(out, 0.7), sr)
}
// A low swell of a struck cymbal played backwards, to lead into big moments
export function swell(sr, { dur = 1.6, seed = 29 } = {}) {
  const n = Math.round(sr * dur), out = new Float32Array(n), rnd = noiseGen(seed)
  const hp = biquad('highpass', 3000, 0.7, sr), bp = biquad('bandpass', 7000, 1.2, sr)
  for (let i = 0; i < n; i++) { const t = i / n; out[i] = (hp(rnd()) * 0.6 + bp(rnd()) * 0.4) * t ** 2.4 }
  return normalise(out, 0.6)
}

/* ---------------- rooms ---------------- */
// A stereo impulse response: a few early reflections, then a diffuse tail that darkens as it fades.
// decay: seconds to fall about 60 dB · predelay: ms before the tail · damp: how fast treble dies (0-1) ·
// width: how different the two ears are
export function roomImpulse(sr, { decay = 2, predelay = 18, damp = 0.5, early = 0.5, width = 1, seed = 41 } = {}) {
  const len = Math.round(sr * (decay + predelay / 1000 + 0.1))
  const L = new Float32Array(len), R = new Float32Array(len)
  const pre = Math.round((sr * predelay) / 1000)
  const rl = noiseGen(seed), rr = noiseGen(seed + 97)
  // Early reflections: sparse taps off the nearest walls
  const taps = [[7, 0.7], [11, 0.55], [17, 0.45], [23, 0.35], [31, 0.28], [43, 0.2]]
  for (const [ms, a] of taps) {
    const i = Math.round((sr * ms * (0.6 + decay * 0.25)) / 1000)
    if (i < len) { L[i] += a * early; R[Math.min(len - 1, i + Math.round(sr * 0.0011 * width))] += a * early * 0.9 }
  }
  // The tail: exponential decay, filtered darker as time goes on
  let fl = 0, fr = 0
  for (let i = pre; i < len; i++) {
    const t = (i - pre) / sr
    const env = Math.exp((-6.9 * t) / decay)
    const k = Math.min(0.97, 0.15 + damp * 0.8 * Math.min(1, t / decay))
    fl = fl * k + rl() * (1 - k)
    fr = fr * k + (width * rr() + (1 - width) * rl()) * (1 - k)
    L[i] += fl * env
    R[i] += fr * env
  }
  // Fade in the first milliseconds of the tail, so it blooms instead of clicking
  const fade = Math.round(sr * 0.008)
  for (let i = 0; i < fade && pre + i < len; i++) { L[pre + i] *= i / fade; R[pre + i] *= i / fade }
  const m = Math.max(...[L, R].map(d => d.reduce((a, v) => Math.max(a, Math.abs(v)), 0)))
  for (let i = 0; i < len; i++) { L[i] /= m; R[i] /= m }
  return [L, R]
}

/* ---------------- WAV, to listen to a render outside the game ---------------- */
export function toWav(channels, sr) {
  const ch = channels.length, n = channels[0].length, bytes = 44 + n * ch * 2
  const buf = new ArrayBuffer(bytes), v = new DataView(buf)
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, bytes - 8, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true)
  v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, n * ch * 2, true)
  let o = 44
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { v.setInt16(o, Math.max(-1, Math.min(1, channels[c][i])) * 32767, true); o += 2 }
  return new Uint8Array(buf)
}
