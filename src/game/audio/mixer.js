/*
  MIXER — the signal chain everything plays through, built on any WebAudio context (live or offline).

    instruments ─► music ─► rumble cut ─► EQ (body, less mud, air) ─► bus compressor ─► low-HP filter ─► duck ─┐
         └─ sends ─► room A / room B (crossfaded convolvers) ─────────────────────────────────────────────────┤
    ambience, effects, voices ─────────────────────────────────────────────────────────────────────────────────┤
                                                       master ─► soft treble ─► gentle saturation ─► mono ─► limiter ─► analyser ─► out
*/
import { roomImpulse } from './dsp.js'
import { ROOMS } from '../data/audio.js'

// A soft saturation curve: transparent at low levels, rounding off peaks the way tape does
function satCurve(drive = 1.4, n = 2048) {
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive) }
  return c
}

export function buildGraph(ctx, destination = ctx.destination) {
  const g = { ctx, roomWet: 0.3, bright: 2400, room: null }
  const gain = v => { const n = ctx.createGain(); n.gain.value = v; return n }
  const filter = (type, freq, q = 0.7, gainDb = 0) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; f.gain.value = gainDb; return f }

  // The end of the chain
  g.limiter = ctx.createDynamicsCompressor()
  g.limiter.threshold.value = -2.5; g.limiter.knee.value = 0; g.limiter.ratio.value = 20; g.limiter.attack.value = 0.002; g.limiter.release.value = 0.12
  g.analyser = ctx.createAnalyser(); g.analyser.fftSize = 2048; g.analyser.smoothingTimeConstant = 0.82
  g.limiter.connect(g.analyser); g.analyser.connect(destination)
  g.mono = gain(1); g.mono.connect(g.limiter)
  g.sat = ctx.createWaveShaper(); g.sat.curve = satCurve(); g.sat.oversample = '2x'; g.sat.connect(g.mono)
  g.tone = filter('lowpass', 20000, 0.5); g.tone.connect(g.sat)
  g.master = gain(1); g.master.connect(g.tone)

  // The music bus: cleaned, shaped and glued before it meets the rest
  g.music = gain(1)
  const rumble = filter('highpass', 32, 0.7)
  const body = filter('lowshelf', 140, 0.7, 1.5)
  const mud = filter('peaking', 380, 0.9, -2)
  const air = filter('highshelf', 9000, 0.7, 2)
  g.glue = ctx.createDynamicsCompressor()
  g.glue.threshold.value = -20; g.glue.knee.value = 8; g.glue.ratio.value = 2.4; g.glue.attack.value = 0.025; g.glue.release.value = 0.3
  const makeup = gain(1.35)
  g.lowHp = filter('lowpass', 20000, 0.6)
  g.duck = gain(1)
  g.musicVol = gain(1)
  g.music.connect(rumble).connect(body).connect(mud).connect(air).connect(g.glue).connect(makeup).connect(g.lowHp).connect(g.duck).connect(g.musicVol).connect(g.master)

  // Two rooms that crossfade when the music moves somewhere else
  g.reverbIn = gain(1)
  g.rooms = [0, 1].map(() => { const c = ctx.createConvolver(), out = gain(0); g.reverbIn.connect(c); c.connect(out); out.connect(g.lowHp); return { c, out, id: null } })
  g.active = 0

  // Other buses
  g.amb = gain(1); g.amb.connect(g.master)
  g.sfx = gain(1); g.sfx.connect(g.master)
  g.voice = gain(1); g.voice.connect(g.master)

  // Noise for breath and ambience, made once
  g.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const nd = g.noise.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1

  const irCache = {}
  // Move the music into a room: the new one fades in on the idle convolver while the old fades out
  g.setRoom = (id, fade = 2.5) => {
    const spec = ROOMS[id] || ROOMS.hall
    g.roomWet = spec.wet
    if (g.room === id) return
    g.room = id
    const t = ctx.currentTime
    const next = g.rooms[1 - g.active], cur = g.rooms[g.active]
    if (!irCache[id]) {
      const [L, R] = roomImpulse(ctx.sampleRate, spec)
      const b = ctx.createBuffer(2, L.length, ctx.sampleRate)
      b.getChannelData(0).set(L); b.getChannelData(1).set(R)
      irCache[id] = b
    }
    if (next.id !== id) { next.c.buffer = irCache[id]; next.id = id }
    next.out.gain.cancelScheduledValues(t); cur.out.gain.cancelScheduledValues(t)
    next.out.gain.setTargetAtTime(1, t, fade / 4)
    cur.out.gain.setTargetAtTime(0, t, fade / 4)
    g.active = 1 - g.active
  }
  return g
}
