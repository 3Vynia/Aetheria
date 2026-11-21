import { reactive } from 'vue'
import { state, G } from './engine.js'
import { AREAS } from './data/combat.js'
import { THEMES, STINGERS, AREA_AMBIENCE, DUNGEON_AMBIENCE, SHUFFLE_IDS, SHUFFLE_PLAY, SHUFFLE_GAP } from './data/audio.js'
import { buildGraph } from './audio/mixer.js'
import { createComposer, hash } from './audio/composer.js'
import { playNote, warmUp } from './audio/instruments.js'

/*
  Music and ambient sound, synthesised with WebAudio: no audio files.
  - The music is a playlist of fifty themes (data/audio.js) played in a shuffled order, a few minutes
    each, whatever screen is open; one can also be kept on its own. The composer (audio/composer.js)
    writes each as it plays, in phrases built on the theme's motif; the instruments (audio/instruments.js)
    play it in the theme's room, through the mixer's chain (audio/mixer.js).
  - Fights raise the intensity: drums join, and at low health the music dulls under a heartbeat.
  - Ambience follows the weather (rain, wind, thunder, birds, crickets, snow, fog) and the region being
    fought in (brooks, dripping caves, frogs, wind chimes, a dragon breathing…).
  Effects and alerts (sound.js) and voices (voices.js) share the same context and master chain.
  Browsers only allow audio after the player has clicked or pressed a key, so nothing starts before.
*/

/* ================= scenes ================= */
const AREA_OF = {}
AREAS.forEach(a => a.monsters.forEach(m => (AREA_OF[m.id] = a.id)))
// The region being fought in, for its ambience
export function areaFor(s = state) {
  const a = s.activity
  if (a?.type !== 'combat') return null
  if (a.kind === 'area') return AREA_OF[a.target] || null
  if (a.kind === 'dungeon') return 'dungeon'
  return null
}

// Which ambient layers each weather uses (levels 0-1)
const AMBIENCE = {
  clear: { birds: 0.6 }, clearNight: { crickets: 0.7 }, cloudy: { wind: 0.25 }, rain: { rain: 0.8, wind: 0.15 },
  fog: { wind: 0.2, hum: 0.6 }, wind: { wind: 0.8 }, snow: { wind: 0.3, snow: 0.5 }, storm: { rain: 1, wind: 0.5, thunder: 1 },
  heatwave: { insects: 0.6 }, blizzard: { wind: 1, snow: 1 },
}
export const ambienceFor = (weather, night) => AMBIENCE[weather === 'clear' && night ? 'clearNight' : weather] || {}
export const areaAmbienceFor = area => (area === 'dungeon' ? DUNGEON_AMBIENCE : AREA_AMBIENCE[area] || {})

// What is playing and why, for the settings screen
export const nowPlaying = reactive({ theme: 'calm', reason: 'auto', area: null, weather: 'clear', night: false, preview: null, intensity: 2, next: null })

/* ================= the audio graph ================= */
let ctx = null, graph = null, ambBus, noise
let unlocked = false, running = false, timer = null
let scene = { weather: 'clear', night: false, area: null }
let nextBar = 0, preview = null, stream = null
const layers = {}
let captionFn = null
const captionAt = {}

const midiHz = n => 440 * 2 ** ((n - 69) / 12)
const level = v => Math.max(0, Math.min(100, v ?? 0)) / 100
const curve = v => v * v // volume sliders feel even to the ear
const settings = () => state.settings || {}
const hiddenTab = () => typeof document !== 'undefined' && document.hidden
// With the tab hidden and "silence in the background" on, only the alerts allowed there still sound
export const hiddenQuiet = () => hiddenTab() && settings().muteHidden !== false

export function audioContext() {
  if (ctx) return ctx
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!AC) return null
  ctx = new AC({ latencyHint: 'playback' })
  graph = buildGraph(ctx)
  ambBus = graph.amb
  noise = graph.noise
  graph.setRoom('hall', 0.1)
  applyAudioSettings()
  return ctx
}
// Where sound effects go, so they follow the effects and master volume
export const sfxOut = () => (audioContext() ? graph.sfx : null)
// Where the characters' voices go, with their own volume
export const voiceOut = () => (audioContext() ? graph.voice : null)
// The output analyser, for the sound screen's visuals
export const audioAnalyser = () => (ctx ? graph.analyser : null)

const previewing = () => !!(preview && ctx && ctx.currentTime < preview.until)
export function applyAudioSettings() {
  if (!ctx) return
  const st = settings(), t = ctx.currentTime
  const quiet = hiddenQuiet()
  graph.master.gain.setTargetAtTime(st.muted ? 0 : curve(level(st.masterVol ?? 80)), t, 0.3)
  const musicOn = (st.music !== false || previewing()) && !quiet
  graph.musicVol.gain.setTargetAtTime(musicOn ? curve(level(st.musicVol ?? 45)) * 0.75 : 0, t, 0.5)
  graph.amb.gain.setTargetAtTime(st.ambience !== false && !quiet ? curve(level(st.ambienceVol ?? 50)) * 0.7 : 0, t, 0.5)
  graph.sfx.gain.setTargetAtTime(st.sound !== false ? curve(level(st.sfxVol ?? 70)) : 0, t, 0.05)
  graph.voice.gain.setTargetAtTime(st.voices !== false ? curve(level(st.voiceVol ?? 60)) : 0, t, 0.05)
  // Accessibility: softer treble and mono sound
  graph.tone.frequency.setTargetAtTime(st.softTone ? 4200 : 20000, t, 0.2)
  graph.mono.channelCount = st.mono ? 1 : 2
  graph.mono.channelCountMode = st.mono ? 'explicit' : 'max'
  // Nothing to play at all: the context rests, and wakes again when something is turned back on
  const silentAll = st.muted || (st.music === false && st.ambience === false && st.sound === false && st.voices === false && !previewing())
  if (silentAll && ctx.state === 'running') ctx.suspend?.()
  else if (!silentAll && ctx.state === 'suspended' && unlocked) ctx.resume?.()
}

// Every node is let go of once its sound has ended
function release(src, ...nodes) { src.onended = () => { src.disconnect(); nodes.forEach(n => n.disconnect()) } }

/* ================= music ================= */
// The playlist: every theme once, in a shuffled order, before any comes back; never the same twice in a row
export function shuffleBag(ids, last = null, rnd = Math.random) {
  const bag = [...ids]
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]] }
  if (bag.length > 1 && bag[0] === last) bag.push(bag.shift())
  return bag
}
let bag = [], shuffleId = null, playedBars = 0, targetBars = 0
function nextShuffle() {
  if (!bag.length) bag = shuffleBag(SHUFFLE_IDS, shuffleId)
  shuffleId = bag.shift()
  if (!bag.length) bag = shuffleBag(SHUFFLE_IDS, shuffleId)
  nowPlaying.next = bag[0]
  playedBars = 0
  targetBars = 0
  return shuffleId
}
export function currentTheme() {
  if (previewing()) return preview.id
  const st = settings()
  if (st.musicMode === 'locked' && THEMES[st.musicTheme]) return st.musicTheme
  return shuffleId || nextShuffle()
}
// Move on to the next theme of the playlist now; what is ringing fades on its own
export function skipTheme() {
  if (!ctx) return
  if (settings().musicMode === 'locked') settings().musicMode = 'auto'
  preview = null
  nowPlaying.preview = null
  nextShuffle()
  stream = null
  nextBar = ctx.currentTime + 0.4
  nowPlaying.theme = shuffleId
}
const fighting = () => state.activity?.type === 'combat'
// How full the music is: 0 pads only … 3 with drums. Fights on screen bring the drums
function intensityNow(id) {
  if (previewing()) return 3
  const dense = Math.max(0, Math.min(100, settings().density ?? 60))
  const base = dense < 25 ? 1 : 2
  return fighting() && THEMES[id].perc ? 3 : base
}
// At low health in a fight the music dulls and a heartbeat comes up
function lowHealth() {
  if (!fighting() || state.hp <= 0) return false
  try { return state.hp / G.maxHp() < 0.3 } catch { return false }
}

// Notes a theme needs rendered before it starts
function notesOf(id) {
  const th = THEMES[id], out = []
  const range = (instr, lo, hi) => { for (let m = lo; m <= hi; m++) out.push([instr, m]) }
  if (th.accomp) range(th.accomp.instr, 48 + (th.accomp.octave || 0), 84 + (th.accomp.octave || 0))
  if (th.lead) range(th.lead.instr, (th.lead.center ?? 72) - 11, (th.lead.center ?? 72) + 11)
  if (th.bass) range(th.bass.instr, 24, 48)
  for (const d of ['frame', 'tamb', 'shaker', 'anvil']) out.push([d, 60])
  return out
}

function scheduleBar(at) {
  const id = currentTheme(), th = THEMES[id], st = settings()
  const shuffling = !previewing() && st.musicMode !== 'locked'
  // In the playlist a theme plays for a few minutes and ends on a phrase; a short pause, then the next
  if (shuffling && stream && targetBars && playedBars >= targetBars && stream.index % 8 === 0) {
    nextShuffle()
    stream = null
    return SHUFFLE_GAP
  }
  if (!stream || stream.theme.id !== id) {
    // Each playing of a theme varies its accompaniment and phrasing, while its motif stays its own
    stream = createComposer(th, hash(id) ^ Math.floor(Math.random() * 1e9))
    warmUp(ctx, notesOf(id))
    graph.setRoom(th.room)
    playedBars = 0
    targetBars = 0
  }
  graph.bright = th.bright * (scene.night ? 0.7 : 1)
  const intensity = intensityNow(id)
  const tempo = Math.max(0.6, Math.min(1.4, (st.tempo || 100) / 100))
  const density = Math.max(0, Math.min(100, st.density ?? 60)) / 60
  const { events, len } = stream.bar({ intensity, density, night: scene.night, tempo })
  playedBars++
  if (!targetBars) { const secs = SHUFFLE_PLAY[0] + Math.random() * (SHUFFLE_PLAY[1] - SHUFFLE_PLAY[0]); targetBars = Math.ceil(secs / len / 8) * 8 }
  const palette = st.palette || 'soft'
  for (const e of events) playNote(graph, { ...e, vel: e.vel * th.level }, at + Math.max(0, e.t), palette)
  // A heartbeat under the music when health runs low in a fight
  if (lowHealth()) for (const b of [0, 0.18, len / 2, len / 2 + 0.18]) playNote(graph, { part: 'perc', instr: 'frame', midi: 50, t: b, dur: 0.5, vel: b % (len / 2) ? 0.4 : 0.6 }, at + b, 'soft')
  graph.lowHp.frequency.setTargetAtTime(lowHealth() ? 900 : 20000, at, 0.6)
  nowPlaying.theme = id
  nowPlaying.intensity = intensity
  nowPlaying.reason = previewing() ? 'preview' : st.musicMode === 'locked' ? 'locked' : 'shuffle'
  return len
}
// Short phrases for big moments, in the key of what is playing: bells over a held chord, drums for a victory
export function playStinger(kind, vol = 1) {
  if (!ctx || !running || ctx.state !== 'running' || settings().music === false || hiddenQuiet()) return false
  const th = THEMES[currentTheme()], notes = STINGERS[kind]
  if (!notes) return false
  const at = ctx.currentTime + 0.03, beat = 0.24 * (100 / (settings().tempo || 100))
  const root = th.root + 12
  for (const [deg, b] of notes) playNote(graph, { part: 'lead', instr: 'bell', midi: root + deg + 12, t: 0, dur: 1.4, vel: 0.9 * vol }, at + b * beat)
  const third = kind === 'fall' ? 3 : 4
  for (const iv of [0, third, 7]) playNote(graph, { part: 'pad', instr: kind === 'fall' ? 'choir' : 'strings', midi: root + iv - 12, t: 0, dur: notes[notes.length - 1][1] * beat + 1.2, vel: 0.9 * vol }, at)
  if (kind === 'victory') { playNote(graph, { part: 'perc', instr: 'timpani', midi: th.root - 12, t: 0, dur: 1, vel: vol }, at); playNote(graph, { part: 'perc', instr: 'timpani', midi: th.root - 5, t: 0, dur: 1, vel: 0.8 * vol }, at + notes[notes.length - 1][1] * beat) }
  return true
}
// Big alerts lower the music for a moment
export function duckMusic() {
  if (!ctx) return
  const t = ctx.currentTime
  graph.duck.gain.cancelScheduledValues(t)
  graph.duck.gain.setTargetAtTime(0.7, t, 0.04)
  graph.duck.gain.setTargetAtTime(1, t + 0.4, 0.25)
}
// The music steps back while a character speaks, and comes back when every voice is done
let holds = 0
export function holdDuck(on) {
  holds = Math.max(0, holds + (on ? 1 : -1))
  if (!ctx) return
  const t = ctx.currentTime
  graph.duck.gain.cancelScheduledValues(t)
  graph.duck.gain.setTargetAtTime(holds ? 0.55 : 1, t, holds ? 0.15 : 0.6)
}
export const musicPlaying = () => !!(running && ctx && ctx.state === 'running' && settings().music !== false && !hiddenQuiet())
// Hear a theme for a while, whatever the hero is doing; the game itself is not touched
export function previewTheme(id, seconds = 20) {
  if (!THEMES[id]) return
  unlockNow()
  if (!audioContext()) return
  preview = { id, until: ctx.currentTime + seconds }
  nowPlaying.preview = id
  nextBar = ctx.currentTime + 0.15
  applyAudioSettings()
  if (!running) start()
  setTimeout(() => { if (preview?.id === id && !previewing()) stopPreview() }, seconds * 1000 + 200)
}
export function stopPreview() {
  preview = null
  nowPlaying.preview = null
  applyAudioSettings()
}

/* ================= ambience ================= */
function noiseLayer(id, build) {
  if (layers[id]) return layers[id]
  const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true
  const g = ctx.createGain(); g.gain.value = 0
  const tail = build(src)
  tail.connect(g).connect(ambBus)
  src.start()
  return (layers[id] = { g })
}
function toneLayer(id, freqs) {
  if (layers[id]) return layers[id]
  const g = ctx.createGain(); g.gain.value = 0
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220
  lp.connect(g).connect(ambBus)
  for (const f of freqs) { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(lp); o.start() }
  return (layers[id] = { g })
}
const LAYER_LEVEL = { rain: 0.22, wind: 0.3, snow: 0.12, hum: 0.05, brook: 0.08, drone: 0.07 }
function ensureLayers() {
  noiseLayer('rain', src => {
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000
    src.connect(hp).connect(lp); return lp
  })
  noiseLayer('wind', src => {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.8
    // The wind rises and falls on its own
    const lfo = ctx.createOscillator(), depth = ctx.createGain()
    lfo.frequency.value = 0.07; depth.gain.value = 260
    lfo.connect(depth).connect(bp.frequency); lfo.start()
    src.connect(bp); return bp
  })
  // Snow and blizzards hiss softly; fog hums low
  noiseLayer('snow', src => { const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000; src.connect(hp); return hp })
  toneLayer('hum', [62, 93])
  // Regions: a brook in the meadows, a deep drone in the Abyss and the Void
  noiseLayer('brook', src => {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 0.6
    const lfo = ctx.createOscillator(), depth = ctx.createGain()
    lfo.frequency.value = 0.31; depth.gain.value = 300
    lfo.connect(depth).connect(bp.frequency); lfo.start()
    src.connect(bp); return bp
  })
  toneLayer('drone', [41, 55.2, 61.7])
}
function wantedAmbience() {
  const want = { ...ambienceFor(scene.weather, scene.night) }
  if (settings().areaAmbience !== false) Object.assign(want, areaAmbienceFor(scene.area))
  return want
}
function setLayers() {
  const want = wantedAmbience(), t = ctx.currentTime
  for (const id in LAYER_LEVEL) layers[id]?.g.gain.setTargetAtTime((want[id] || 0) * LAYER_LEVEL[id], t, 2)
}
function chirp(at, from, to, dur, gain, type = 'sine') {
  const o = ctx.createOscillator(), g = ctx.createGain()
  o.type = type; o.frequency.setValueAtTime(from, at); o.frequency.exponentialRampToValueAtTime(to, at + dur)
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + dur * 0.2); g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g).connect(ambBus); release(o, g); o.start(at); o.stop(at + dur + 0.02)
}
function noiseBurst(at, dur, freq, q, gain, rise = 0.2) {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
  src.buffer = noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + dur * rise); g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  src.connect(f).connect(g).connect(ambBus); release(src, f, g); src.start(at, Math.random()); src.stop(at + dur + 0.05)
}
// Thunder at a random distance: the further away, the duller, the later and with more echo
function thunder(at) {
  const far = Math.random()
  for (const [delay, share] of [[0, 1], [0.6 + far * 0.8, 0.35]]) {
    const src = ctx.createBufferSource(); src.buffer = noise
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260 - far * 140
    const g = ctx.createGain(), t = at + far * 0.8 + delay
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime((0.9 - far * 0.4) * share, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5)
    src.connect(lp).connect(g).connect(ambBus); release(src, lp, g); src.start(t); src.stop(t + 3.6)
  }
  caption('thunder')
}
// Sound captions, at most one of a kind every few seconds
export function setCaptionHandler(fn) { captionFn = fn }
function caption(key) {
  if (!settings().subtitles || !captionFn) return
  const now = Date.now()
  if (now - (captionAt[key] || 0) < 12000) return
  captionAt[key] = now
  captionFn(key)
}
const PENTA = [0, 2, 4, 7, 9]
// Little sounds that come and go: birds, crickets, insects, thunder, and each region's own
function ambientEvents(t) {
  const want = wantedAmbience()
  const r = Math.random
  if (want.birds && r() < 0.05 * want.birds) {
    const base = 2200 + r() * 1600, n = 2 + Math.floor(r() * 3)
    for (let i = 0; i < n; i++) chirp(t + i * 0.13, base, base * (1.2 + r() * 0.3), 0.09, 0.05)
  }
  if (want.crickets && r() < 0.18 * want.crickets) for (let i = 0; i < 3; i++) chirp(t + i * 0.06, 4300, 4250, 0.035, 0.02)
  if (want.insects && r() < 0.12 * want.insects) for (let i = 0; i < 6; i++) chirp(t + i * 0.03, 5200, 5000, 0.025, 0.012)
  if (want.thunder && r() < 0.012 * want.thunder) thunder(t + 0.1)
  if (want.bees && r() < 0.03 * want.bees) chirp(t, 210 + r() * 40, 230 + r() * 40, 0.9, 0.012, 'sawtooth')
  if (want.leaves && r() < 0.05 * want.leaves) noiseBurst(t, 0.5, 3200, 0.7, 0.05, 0.4)
  if (want.owl && scene.night && r() < 0.012 * want.owl) { chirp(t, 390, 350, 0.35, 0.05); chirp(t + 0.5, 390, 340, 0.5, 0.05); caption('owl') }
  if (want.drip && r() < 0.07 * want.drip) { const f = 1400 + r() * 900; chirp(t, f, f * 0.55, 0.08, 0.04); chirp(t + 0.28, f, f * 0.55, 0.08, 0.012) }
  if (want.frogs && r() < 0.05 * want.frogs) for (let i = 0; i < 3; i++) chirp(t + i * 0.09, 170, 150, 0.06, 0.03, 'square')
  if (want.bubbles && r() < 0.05 * want.bubbles) chirp(t, 280 + r() * 120, 900, 0.07, 0.025)
  if (want.whisper && r() < 0.02 * want.whisper) { noiseBurst(t, 1.6, 1500, 4, 0.04, 0.5); caption('whisper') }
  if (want.chimes && r() < 0.04 * want.chimes) for (let i = 0; i < 2 + Math.floor(r() * 3); i++) chirp(t + i * 0.18, midiHz(84 + PENTA[Math.floor(r() * 5)]), midiHz(84 + PENTA[0]) * 1.001, 1.8, 0.02)
  if (want.breath && r() < 0.015 * want.breath) { noiseBurst(t, 3, 280, 0.8, 0.12, 0.5); caption('breath') }
  if (want.shimmer && r() < 0.05 * want.shimmer) chirp(t, 3000 + r() * 2000, 3100 + r() * 2000, 1.2, 0.012)
}

/* ================= running ================= */
function tick() {
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime
  if (preview && !previewing()) stopPreview()
  if ((settings().music !== false || previewing()) && !hiddenQuiet()) {
    // After a while in the background the clock may have run ahead: pick up on the next bar
    if (nextBar < t) nextBar = t + 0.2
    while (nextBar < t + 1.5) nextBar += scheduleBar(nextBar)
  }
  if (settings().ambience !== false && !hiddenQuiet() && Math.random() < 0.4) ambientEvents(t)
}
function start() {
  if (running || !unlocked || !audioContext()) return
  running = true
  ensureLayers(); setLayers()
  if (ctx.state === 'suspended') ctx.resume?.()
  timer = setInterval(tick, 100)
}
export function stopAmbient() {
  running = false
  wantRunning = false
  clearInterval(timer)
  if (ctx) for (const id in layers) layers[id].g.gain.setTargetAtTime(0, ctx.currentTime, 0.4)
}
function unlockNow() {
  if (unlocked) return
  unlocked = true
  if (typeof window !== 'undefined') { window.removeEventListener('pointerdown', onUnlock); window.removeEventListener('keydown', onUnlock) }
  audioContext()?.resume?.()
}
let wantRunning = false
function onUnlock() { unlockNow(); if (wantRunning) start() }
export function startAmbient() {
  if (typeof window === 'undefined') return
  wantRunning = true
  if (unlocked) return start()
  // Wait for the first click or key press, as browsers require
  window.addEventListener('pointerdown', onUnlock); window.addEventListener('keydown', onUnlock)
}
// The game tells the music where the hero is, for the ambience and the night
export function setScene(next) {
  scene = { ...scene, ...next }
  Object.assign(nowPlaying, { area: scene.area, weather: scene.weather, night: scene.night })
  if (running && ctx) setLayers()
}
export const audioUnlocked = () => unlocked
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', applyAudioSettings)

/* ================= rendering a theme to a file ================= */
// Plays a theme into an offline context and returns its channels, to listen to it outside the game
export async function renderTheme(id, seconds = 30, { palette = 'soft', intensity = 3, sampleRate = 44100, night = false, gain = 0.55 } = {}) {
  const th = THEMES[id]
  const off = new OfflineAudioContext(2, Math.round(sampleRate * seconds), sampleRate)
  const g = buildGraph(off)
  g.setRoom(th.room, 0.01)
  g.bright = th.bright
  g.musicVol.gain.value = gain
  const comp = createComposer(th)
  warmUp(off, notesOf(id), true)
  let at = 0.1
  while (at < seconds - 1) {
    const { events, len } = comp.bar({ intensity, density: 1, night })
    for (const e of events) playNote(g, { ...e, vel: e.vel * th.level }, at + Math.max(0, e.t), palette)
    at += len
  }
  const buf = await off.startRendering()
  return { channels: [buf.getChannelData(0), buf.getChannelData(1)], sampleRate }
}
