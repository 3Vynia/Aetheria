import { state } from './engine.js'
import { audioContext, sfxOut, duckMusic, playStinger, musicPlaying, hiddenQuiet } from './music.js'
import { CUE_MAP, CUE_LIMIT, GROUP_WINDOW } from './data/audio.js'
import { pluckString, fmBell, frameDrum, shaker, noiseGen, biquad } from './audio/dsp.js'

/*
  Sound effects and the alerts that play them, synthesised with WebAudio (no audio files).
  Every alert can be turned off, given its own volume, heard with the tab hidden or sent as a browser
  notification. The manager keeps an idle game from turning into a wall of beeps: each alert waits a
  little before it can sound again, bursts become a single sound, and crowded moments drop the least
  important ones. Big alerts lower the music for a moment, and some play a short musical phrase.
*/
/* ---------------- the sounds ---------------- */
// Each effect is built from layers rendered once (audio/dsp.js): a transient, a body and a tail. Every
// time it plays it is nudged in pitch and loudness, so a repeated sound never feels mechanical.
let voices = 0
const voiceLimit = () => (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? CUE_LIMIT.mobile : CUE_LIMIT.desktop)
const hz = m => 440 * 2 ** ((m - 69) / 12)

// A short knock of wood: noise through a resonant band, gone in a few milliseconds
function woodClick(sr, freq, seed) {
  const n = Math.round(sr * 0.08), out = new Float32Array(n), rnd = noiseGen(seed), bp = biquad('bandpass', freq, 6, sr)
  for (let i = 0; i < n; i++) out[i] = bp(rnd()) * Math.exp((-i / sr) * 70) * 4
  return out
}
const RENDER = {
  ping: (sr, m) => fmBell(hz(m), sr, { dur: 0.7, ratio: 2.71, index: 1.3, decay: 7, partial: 0.3 }),
  bell: (sr, m) => fmBell(hz(m), sr, { dur: 1.6, ratio: 3.5, index: 2, decay: 2.6 }),
  glass: (sr, m) => fmBell(hz(m), sr, { dur: 1.4, ratio: 1.4, index: 0.9, decay: 3, partial: 0.1 }),
  harp: (sr, m) => pluckString(hz(m), sr, { dur: 1.6, decay: 0.998, bright: 0.45, pick: 0.4, body: 0.1 }),
  mute: (sr, m) => pluckString(hz(m), sr, { dur: 0.6, decay: 0.986, bright: 0.25, pick: 0.3, body: 0.4 }),
  thud: sr => frameDrum(sr, { pitch: 64, dur: 0.5, slap: 0.15 }),
  grain: sr => shaker(sr, { dur: 0.09 }),
  wood: (sr, m) => woodClick(sr, hz(m), m),
}
const buffers = new Map()
function buffer(ctx, kind, midi = 60) {
  const key = kind + ':' + midi
  let b = buffers.get(key)
  if (!b) {
    const d = RENDER[kind](ctx.sampleRate, midi)
    b = ctx.createBuffer(1, d.length, ctx.sampleRate)
    b.getChannelData(0).set(d)
    buffers.set(key, b)
  }
  return b
}
// One layer: a rendered sound, when, how loud, a little detuned and placed in the stereo field
function layer(ctx, out, kind, midi, at, vol, pan = 0) {
  const src = ctx.createBufferSource(), g = ctx.createGain()
  src.buffer = buffer(ctx, kind, midi)
  src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.03
  g.gain.value = vol * (0.88 + Math.random() * 0.12)
  let tail = g
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p }
  src.connect(g)
  tail.connect(out)
  voices++
  src.onended = () => { voices--; src.disconnect(); g.disconnect(); if (tail !== g) tail.disconnect() }
  src.start(at)
}
// The effects, as layers: [sound, MIDI note, delay in seconds, loudness, pan]
const DESIGNS = {
  classic: {
    coin: [['grain', 60, 0, 0.5, 0.2], ['ping', 91, 0, 1, -0.1], ['ping', 95, 0.07, 0.8, 0.15]],
    level: [['harp', 60, 0, 0.7, -0.2], ['bell', 84, 0.02, 0.6, 0], ['bell', 88, 0.11, 0.6, 0.1], ['bell', 91, 0.2, 0.7, 0.2], ['bell', 96, 0.3, 0.55, 0.25]],
    quest: [['harp', 55, 0, 0.8, -0.3], ['harp', 62, 0.045, 0.7, -0.1], ['harp', 67, 0.09, 0.7, 0.1], ['harp', 71, 0.135, 0.7, 0.2], ['bell', 86, 0.24, 0.7, 0.15]],
    rare: [['glass', 84, 0, 0.6, -0.3], ['glass', 88, 0.06, 0.6, -0.1], ['glass', 91, 0.12, 0.65, 0.1], ['glass', 96, 0.18, 0.7, 0.25], ['bell', 100, 0.26, 0.5, 0.3], ['grain', 60, 0.26, 0.6, 0]],
    bad: [['thud', 60, 0, 0.9, 0], ['mute', 45, 0, 0.9, -0.1], ['mute', 40, 0.14, 0.9, 0.1]],
    dice: [['wood', 79, 0, 0.9, -0.2], ['wood', 84, 0.06, 0.7, 0.1], ['wood', 81, 0.11, 0.6, 0.25]],
    burst: [['glass', 88, 0, 0.5, -0.2], ['glass', 91, 0.04, 0.5, 0], ['glass', 96, 0.08, 0.55, 0.2], ['glass', 100, 0.12, 0.5, 0.3]],
    tick: [['wood', 86, 0, 0.45, 0]],
  },
  crystal: {
    coin: [['glass', 96, 0, 0.9, -0.1], ['glass', 100, 0.06, 0.7, 0.15]],
    level: [['glass', 84, 0, 0.7, -0.2], ['glass', 88, 0.09, 0.7, 0], ['glass', 91, 0.18, 0.7, 0.15], ['glass', 96, 0.27, 0.7, 0.25]],
    quest: [['glass', 79, 0, 0.7, -0.2], ['glass', 86, 0.1, 0.7, 0], ['glass', 91, 0.2, 0.75, 0.2]],
    rare: [['glass', 91, 0, 0.6, -0.3], ['glass', 96, 0.05, 0.6, 0], ['glass', 100, 0.1, 0.65, 0.2], ['glass', 103, 0.15, 0.6, 0.3]],
    bad: [['glass', 64, 0, 0.7, 0], ['glass', 59, 0.15, 0.7, 0]],
    dice: [['glass', 88, 0, 0.5, -0.2], ['glass', 91, 0.05, 0.4, 0.2]],
    burst: [['glass', 96, 0, 0.5, -0.2], ['glass', 100, 0.04, 0.5, 0.2]],
    tick: [['glass', 100, 0, 0.3, 0]],
  },
  minimal: {
    coin: [['wood', 88, 0, 1.08, 0]], level: [['harp', 72, 0, 1.08, 0]], quest: [['harp', 67, 0, 1.08, 0], ['harp', 74, 0.08, 0.9, 0]],
    rare: [['glass', 91, 0, 0.9, 0]], bad: [['mute', 48, 0, 1.26, 0]], dice: [['wood', 81, 0, 1.08, 0]], burst: [['wood', 88, 0, 0.9, 0]], tick: [['wood', 86, 0, 0.63, 0]],
  },
}
// One effect in one of the packs: classic (strings, bells and wood), crystal (glass and bells) or minimal (soft single sounds)
function render(kind, pack, volume) {
  const ctx = audioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume()
  const out = sfxOut(), now = ctx.currentTime + 0.005
  const design = (DESIGNS[pack] || DESIGNS.classic)[kind] || DESIGNS.classic[kind] || DESIGNS.classic.coin
  // The layers were tuned for an alert at 0.12 to sit just under the music; its volume scales them
  const vol = volume / 0.12 * 0.25
  for (const [snd, midi, delay, v, pan] of design) layer(ctx, out, snd, midi, now + delay, v * vol, pan)
}
export const SOUND_KINDS = Object.keys(DESIGNS.classic)

/* ---------------- the alert manager ---------------- */
// How a single alert is set up: the catalogue's defaults under the player's own choices
export function cueSettings(id, settings = state.settings) {
  const c = CUE_MAP[id]
  return { on: true, vol: 100, bg: !!c?.bg, notify: !!c?.bg, ...(settings?.cues?.[id] || {}) }
}
export function setCue(id, patch) {
  const cues = (state.settings.cues ||= {})
  cues[id] = { ...cueSettings(id), ...patch }
}
// Whether an alert may sound now: 'play', 'hold' (part of a burst) or 'skip' (too soon after the last)
export function gateCue(memo, cue, now) {
  const m = (memo[cue.id] ||= { last: -Infinity, held: 0 })
  if (cue.group && now - m.last < GROUP_WINDOW) { m.held++; return 'hold' }
  if (now - m.last < cue.gap) return 'skip'
  m.last = now
  m.held = 0
  return 'play'
}
const memo = {}
const flushes = {}
// With the sound off, important alerts can still light up the screen
function flash() {
  if (state.settings?.visualCues === false || state.settings?.reduceMotion || typeof document === 'undefined') return
  const b = document.body
  b.classList.remove('cue-flash')
  void b.offsetWidth
  b.classList.add('cue-flash')
  setTimeout(() => b.classList.remove('cue-flash'), 900)
}
/*
  Play an alert from the catalogue.
  opts.sound: another effect than the alert's own · opts.notify: [title, body] for a browser notification
  when the tab is hidden · opts.force: a preview, which skips every rule
*/
export function cue(id, opts = {}) {
  const c = CUE_MAP[id]
  const st = state.settings
  if (!c || !st) return
  const cs = cueSettings(id)
  const hidden = typeof document !== 'undefined' && document.hidden
  if (opts.notify && hidden && cs.notify) notify(...opts.notify)
  if (!cs.on && !opts.force) return
  const audible = st.sound !== false && !st.muted
  if (!audible) { if (c.prio === 'high' && !opts.force) flash(); if (!opts.force) return }
  if (!opts.force && hiddenQuiet() && !cs.bg) return
  if (!opts.force) {
    if (voices >= voiceLimit() && c.prio !== 'high') return
    const gate = gateCue(memo, c, Date.now())
    if (gate === 'skip') return
    if (gate === 'hold') {
      // The end of a burst plays one quick run, however many there were
      if (!flushes[id]) flushes[id] = setTimeout(() => { flushes[id] = null; if (memo[id]?.held > 0) { memo[id].held = 0; render('burst', st.sfxPack, 0.1 * cs.vol / 100) } }, GROUP_WINDOW)
      return
    }
  }
  try {
    const vol = 0.12 * Math.max(0, Math.min(150, cs.vol)) / 100
    if (c.prio === 'high') duckMusic()
    if (c.stinger && !opts.sound && musicPlaying() && playStinger(c.stinger, cs.vol / 100)) return
    render(opts.sound || c.sound, st.sfxPack || 'classic', vol)
  } catch { /* audio unavailable */ }
}
export function previewCue(id) { cue(id, { force: true }) }
export function previewPack(pack) { try { render('quest', pack, 0.12) } catch { /* audio unavailable */ } }

// Small sounds for buttons and actions on screen; they follow the "Interface" alert
export function play(kind) { cue('ui', { sound: kind }) }

// Browser notifications: only when the player enabled them and the tab is hidden
export async function requestNotify() {
  try {
    if (!('Notification' in window)) return false
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    return perm === 'granted'
  } catch { return false }
}
export function notify(title, body) {
  try {
    if (!state.settings?.notify || !document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return
    new Notification(title, { body, tag: title })
  } catch { /* notifications unavailable */ }
}

// Every effect of a pack one after another, rendered offline, to listen to them outside the game
export async function renderEffects(pack = 'classic', sampleRate = 44100) {
  const gap = 1.3, kinds = SOUND_KINDS
  const off = new OfflineAudioContext(2, Math.round(sampleRate * (kinds.length * gap + 1)), sampleRate)
  const out = off.createGain()
  out.gain.value = 0.9
  out.connect(off.destination)
  kinds.forEach((k, i) => { for (const [snd, midi, delay, v, pan] of DESIGNS[pack][k]) layer(off, out, snd, midi, 0.2 + i * gap + delay, v * 0.5, pan) })
  const buf = await off.startRendering()
  return { channels: [buf.getChannelData(0), buf.getChannelData(1)], sampleRate, kinds }
}
