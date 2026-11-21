import { state } from './engine.js'
import { audioContext, voiceOut, hiddenQuiet, holdDuck } from './music.js'

/*
  Character voices: speech made of tiny sung syllables, synthesised with WebAudio (no audio files and
  no real words, so it sounds the same in every language). Each syllable is sung on the vowel of its letters,
  through that vowel's formants, and starts with the kind of consonant they begin with. Each character has a
  timbre and a throat of its own; the same text always sounds the same, sentences fall at the end and questions rise.
  timeline() says when each character of the text shows, so the words appear in step with the voice.
*/

// base: pitch in Hz · range: semitones the syllables wander · wave and formant: the colour of the voice
// cps: letters per second · syll: how long a syllable rings · vibrato: in cents · echo: 0 to 1 · breath: a whisper
export const VOICES = {
  narrator: { base: 175, range: 5, wave: 'sine', formant: 1100, q: 1.2, cps: 38, syll: 0.07, vol: 0.5, vibrato: 0, echo: 0.15, breath: 0.15 },
  keeper: { base: 150, range: 7, wave: 'triangle', formant: 900, q: 2, cps: 34, syll: 0.075, vol: 0.75, vibrato: 0, echo: 0, breath: 0 },
  edmund: { base: 120, range: 4, wave: 'triangle', formant: 750, q: 2.5, cps: 24, syll: 0.1, vol: 0.7, vibrato: 25, echo: 0.1, breath: 0.05 },
  king: { base: 110, range: 4, wave: 'sine', formant: 700, q: 2, cps: 22, syll: 0.12, vol: 0.7, vibrato: 10, echo: 0.45, breath: 0.1 },
  astrologer: { base: 220, range: 9, wave: 'sine', formant: 1500, q: 3, cps: 26, syll: 0.09, vol: 0.6, vibrato: 18, echo: 0.2, breath: 0 },
  smith: { base: 95, range: 5, wave: 'sawtooth', formant: 650, q: 3, cps: 36, syll: 0.06, vol: 0.55, vibrato: 0, echo: 0, breath: 0 },
  morwen: { base: 235, range: 6, wave: 'sine', formant: 1300, q: 1.5, cps: 28, syll: 0.1, vol: 0.55, vibrato: 12, echo: 0.35, breath: 0.4 },
  priest: { base: 165, range: 3, wave: 'sine', formant: 950, q: 2, cps: 26, syll: 0.1, vol: 0.6, vibrato: 6, echo: 0.3, breath: 0 },
  captain: { base: 130, range: 5, wave: 'square', formant: 800, q: 3, cps: 36, syll: 0.06, vol: 0.4, vibrato: 0, echo: 0, breath: 0 },
  winter: { base: 290, range: 7, wave: 'sine', formant: 1800, q: 4, cps: 24, syll: 0.12, vol: 0.5, vibrato: 30, echo: 0.5, breath: 0.2 },
  wyrm: { base: 62, range: 4, wave: 'sawtooth', formant: 420, q: 4, cps: 18, syll: 0.16, vol: 0.6, vibrato: 0, echo: 0.55, breath: 0.15 },
  selene: { base: 255, range: 8, wave: 'triangle', formant: 1400, q: 2, cps: 32, syll: 0.08, vol: 0.6, vibrato: 8, echo: 0.2, breath: 0.1 },
  ancient: { base: 52, range: 3, wave: 'sawtooth', formant: 380, q: 5, cps: 16, syll: 0.18, vol: 0.6, vibrato: 0, echo: 0.6, breath: 0.2 },
  warden: { base: 75, range: 2, wave: 'sawtooth', formant: 500, q: 6, cps: 18, syll: 0.15, vol: 0.55, vibrato: 40, echo: 0.6, breath: 0.3 },
  firstKing: { base: 140, range: 5, wave: 'triangle', formant: 1000, q: 2, cps: 22, syll: 0.12, vol: 0.65, vibrato: 10, echo: 0.5, breath: 0 },
  // Companions met along the way
  maelis: { base: 200, range: 8, wave: 'triangle', formant: 1000, q: 2.5, cps: 26, syll: 0.1, vol: 0.6, vibrato: 14, echo: 0.1, breath: 0.35 },
  hollis: { base: 100, range: 3, wave: 'square', formant: 700, q: 3, cps: 24, syll: 0.1, vol: 0.4, vibrato: 0, echo: 0, breath: 0.05 },
  seren: { base: 215, range: 4, wave: 'triangle', formant: 1350, q: 2, cps: 30, syll: 0.08, vol: 0.6, vibrato: 0, echo: 0.25, breath: 0.1 },
  ardan: { base: 145, range: 4, wave: 'sine', formant: 900, q: 1.8, cps: 22, syll: 0.12, vol: 0.6, vibrato: 10, echo: 0.3, breath: 0.25 },
  vela: { base: 190, range: 6, wave: 'triangle', formant: 1250, q: 2, cps: 40, syll: 0.06, vol: 0.55, vibrato: 0, echo: 0, breath: 0.2 },
  // The people who give quests
  oldman: { base: 115, range: 6, wave: 'triangle', formant: 800, q: 2.5, cps: 24, syll: 0.1, vol: 0.65, vibrato: 30, echo: 0, breath: 0.15 },
  farmer: { base: 205, range: 7, wave: 'triangle', formant: 1100, q: 2, cps: 34, syll: 0.075, vol: 0.65, vibrato: 0, echo: 0, breath: 0 },
  granny: { base: 240, range: 8, wave: 'sine', formant: 1250, q: 2.5, cps: 22, syll: 0.1, vol: 0.6, vibrato: 45, echo: 0, breath: 0.15 },
  huntress: { base: 225, range: 5, wave: 'triangle', formant: 1300, q: 2, cps: 36, syll: 0.07, vol: 0.6, vibrato: 0, echo: 0, breath: 0.05 },
  shade: { base: 135, range: 4, wave: 'sine', formant: 1500, q: 1.5, cps: 30, syll: 0.08, vol: 0.45, vibrato: 0, echo: 0.1, breath: 0.6 },
  druid: { base: 140, range: 4, wave: 'sine', formant: 700, q: 1.5, cps: 22, syll: 0.12, vol: 0.6, vibrato: 8, echo: 0.2, breath: 0.3 },
  merchant: { base: 175, range: 9, wave: 'square', formant: 1400, q: 4, cps: 38, syll: 0.06, vol: 0.35, vibrato: 0, echo: 0, breath: 0 },
  youth: { base: 260, range: 9, wave: 'triangle', formant: 1500, q: 2, cps: 46, syll: 0.055, vol: 0.55, vibrato: 0, echo: 0, breath: 0 },
  slayer: { base: 105, range: 3, wave: 'triangle', formant: 650, q: 3, cps: 26, syll: 0.09, vol: 0.7, vibrato: 0, echo: 0.1, breath: 0.1 },
  oracle: { base: 270, range: 5, wave: 'sine', formant: 1700, q: 3, cps: 20, syll: 0.13, vol: 0.55, vibrato: 20, echo: 0.55, breath: 0.2 },
  // Bosses that are not people of the story
  goblin: { base: 330, range: 10, wave: 'square', formant: 1600, q: 3, cps: 44, syll: 0.05, vol: 0.35, vibrato: 0, echo: 0, breath: 0.1 },
  troll: { base: 70, range: 4, wave: 'triangle', formant: 450, q: 3, cps: 16, syll: 0.16, vol: 0.75, vibrato: 0, echo: 0.1, breath: 0.1 },
  skeleton: { base: 125, range: 6, wave: 'square', formant: 900, q: 6, cps: 26, syll: 0.08, vol: 0.35, vibrato: 50, echo: 0.3, breath: 0.25 },
  kraken: { base: 48, range: 5, wave: 'sine', formant: 300, q: 2, cps: 15, syll: 0.2, vol: 0.85, vibrato: 35, echo: 0.6, breath: 0.2 },
  necromancer: { base: 145, range: 7, wave: 'sawtooth', formant: 1200, q: 5, cps: 28, syll: 0.09, vol: 0.4, vibrato: 15, echo: 0.35, breath: 0.45 },
}
export const voiceOf = id => VOICES[id] || VOICES.narrator

const LETTER = /\p{L}|\p{N}/u
const PAUSE = { '.': 0.32, '!': 0.32, '?': 0.32, '…': 0.4, ',': 0.14, ';': 0.18, ':': 0.18, '—': 0.2, '\n': 0.45 }
const LETTERS_PER_SYLLABLE = 2
// How fast the voices read, chosen in the sound settings
export const VOICE_SPEEDS = { slow: 0.8, normal: 1, fast: 1.3 }

// A small number from a piece of text, the same every time
function hash(str) {
  let h = 2166136261
  for (const ch of str) h = Math.imul(h ^ ch.codePointAt(0), 16777619)
  return (h >>> 0) / 4294967296
}

/* When each character of `text` shows (seconds from the start) and the syllables the voice sings,
   with their time and pitch. Pure, so it can be tested and drawn without sound */
export function timeline(text, voiceId, speed = 1) {
  const v = voiceOf(voiceId)
  const chars = [...text]
  const at = new Array(chars.length)
  const sylls = []
  const step = 1 / (v.cps * speed)
  let t = 0, run = '', inSentence = 0
  // How far into its sentence each letter is, for a falling end and a rising question
  const sentenceEnd = i => { for (let k = i; k < chars.length; k++) if ('.!?…\n'.includes(chars[k])) return k; return chars.length }
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    at[i] = t
    if (LETTER.test(ch)) {
      run += ch.toLowerCase()
      if (run.length === 1) {
        const end = sentenceEnd(i)
        const left = end - i
        const question = chars[end] === '?'
        let semi = (hash(run + chars.slice(i, i + 3).join('')) - 0.5) * v.range
        if (left < 6) semi += question ? (6 - left) * 0.9 : -(6 - left) * 0.5
        else semi += Math.sin(inSentence * 0.7) * 0.8
        // The vowel it is sung on, and how it starts: from the letters of the text, so it always sounds the same
        const ahead = chars.slice(i, i + 4).join('').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const vowel = (ahead.match(/[aeiou]/) || ['aeiou'[Math.floor(hash(ahead) * 5)]])[0]
        const first = ahead[0]
        const onset = 'aeiouy'.includes(first) ? null : 'ptkbdgcq'.includes(first) ? 'plosive' : 'sfzjxvh'.includes(first) ? 'fricative' : 'mnñ'.includes(first) ? 'nasal' : 'liquid'
        sylls.push({ t, freq: v.base * 2 ** (semi / 12), stress: hash(run) > 0.7, vowel, onset })
        inSentence++
      }
      if (run.length >= LETTERS_PER_SYLLABLE) run = ''
      t += step
    } else {
      run = ''
      if (PAUSE[ch]) { t += PAUSE[ch] / speed; if ('.!?…\n'.includes(ch)) inSentence = 0 }
      else t += step * 0.6
    }
  }
  return { at, sylls, length: t }
}

/* ---------------- sound ---------------- */
function noiseBuffer(ctx) {
  if (noiseBuffer.buf?.sampleRate === ctx.sampleRate) return noiseBuffer.buf
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return (noiseBuffer.buf = buf)
}

// The three formants of each vowel (Hz) and how strong each is, for an adult voice; smaller or larger
// throats scale them (a voice's `formant` sets its size: 1000 is the middle)
const VOWELS = {
  a: [[730, 1], [1090, 0.5], [2440, 0.22]], e: [[530, 1], [1840, 0.45], [2480, 0.25]], i: [[300, 1], [2290, 0.4], [3010, 0.25]],
  o: [[570, 1], [840, 0.55], [2410, 0.15]], u: [[300, 1], [870, 0.4], [2240, 0.12]],
}
// One syllable: a voice sung on its vowel through three formants, started by its consonant, with a
// little breath and echo
function syllable(ctx, out, v, s, when) {
  const dur = v.syll * (s.stress ? 1.3 : 1)
  const vol = v.vol * 0.5 * (s.stress ? 1.15 : 1)
  const size = Math.max(0.45, Math.min(1.9, v.formant / 1000))
  const nodes = []
  // The voice: a pulse rich in overtones (a square for the strange ones), gliding into its note
  const o = ctx.createOscillator()
  o.type = v.wave === 'square' ? 'square' : 'sawtooth'
  o.frequency.setValueAtTime(s.freq * 1.05, when)
  o.frequency.exponentialRampToValueAtTime(s.freq, when + dur * 0.35)
  if (v.vibrato) {
    const lfo = ctx.createOscillator(), depth = ctx.createGain()
    lfo.frequency.value = 5.5; depth.gain.value = v.vibrato
    lfo.connect(depth).connect(o.detune)
    lfo.start(when); lfo.stop(when + dur + 0.05)
    nodes.push(lfo, depth)
  }
  // Softer voices lose some of their top
  const soft = ctx.createBiquadFilter()
  soft.type = 'lowpass'; soft.frequency.value = v.wave === 'sine' ? 2600 : v.wave === 'triangle' ? 4200 : 7000; soft.Q.value = 0.5
  o.connect(soft)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(vol, when + 0.018)
  g.gain.setValueAtTime(vol, when + dur * 0.6)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  for (const [f, a] of VOWELS[s.vowel] || VOWELS.a) {
    const bp = ctx.createBiquadFilter(), bg = ctx.createGain()
    bp.type = 'bandpass'; bp.frequency.value = f * size; bp.Q.value = Math.max(4, v.q * 3)
    bg.gain.value = a * 2.2
    soft.connect(bp).connect(bg).connect(g)
    nodes.push(bp, bg)
  }
  g.connect(out)
  nodes.push(soft, g)
  // The consonant before the vowel
  const noise = (start, len, type, freq, q, level) => {
    const n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain()
    n.buffer = noiseBuffer(ctx); nf.type = type; nf.frequency.value = freq; nf.Q.value = q
    ng.gain.setValueAtTime(0.0001, start); ng.gain.exponentialRampToValueAtTime(level, start + Math.min(0.006, len / 3)); ng.gain.exponentialRampToValueAtTime(0.0001, start + len)
    n.connect(nf).connect(ng).connect(out)
    n.onended = () => { n.disconnect(); nf.disconnect(); ng.disconnect() }
    n.start(start, Math.random() * 0.3); n.stop(start + len + 0.02)
  }
  if (s.onset === 'plosive') noise(when, 0.014, 'highpass', 1400 * size, 0.7, vol * 0.5)
  else if (s.onset === 'fricative') noise(when, 0.045, 'bandpass', 4800 * size, 1.2, vol * 0.35)
  else if (s.onset === 'nasal') {
    const m = ctx.createOscillator(), mg = ctx.createGain()
    m.type = 'sine'; m.frequency.value = s.freq
    mg.gain.setValueAtTime(0.0001, when); mg.gain.exponentialRampToValueAtTime(vol * 0.5, when + 0.01); mg.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
    m.connect(mg).connect(out); m.onended = () => { m.disconnect(); mg.disconnect() }
    m.start(when); m.stop(when + 0.06)
  }
  // A whisper of breath over the vowel
  if (v.breath) noise(when, dur, 'bandpass', 2200 * size, 1, vol * v.breath * 0.6)
  o.onended = () => { o.disconnect(); nodes.forEach(x => x.disconnect()) }
  o.start(when); o.stop(when + dur + 0.03)
}

// A short echo for ghosts, dragons and the sky, made once per voice line
function echoOut(ctx, out, amount) {
  if (!amount) return { node: out, close() {} }
  const input = ctx.createGain(), delay = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain()
  delay.delayTime.value = 0.16; fb.gain.value = amount * 0.55; wet.gain.value = amount
  input.connect(out)
  input.connect(delay); delay.connect(fb).connect(delay); delay.connect(wet).connect(out)
  return { node: input, close: () => setTimeout(() => [input, delay, fb, wet].forEach(n => n.disconnect()), 2500) }
}

export const voicesOn = () => state.settings?.voices !== false && !state.settings?.muted

// One rune of a rite: a short sung note, each rune on its own step of a pentatonic scale
const RUNE_STEPS = [0, 2, 4, 7, 9, 12]
export function runeTone(i, length = 0.35) {
  const ctx = !state.settings?.muted ? audioContext() : null
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume?.()
  const v = { ...VOICES.priest, syll: length, vol: 0.9, echo: 0.3 }
  const echo = echoOut(ctx, voiceOut(), v.echo)
  syllable(ctx, echo.node, v, { freq: 220 * 2 ** (RUNE_STEPS[i % RUNE_STEPS.length] / 12), stress: true }, ctx.currentTime + 0.02)
  echo.close()
}

/* Speaks a line. Returns { timeline, stop }: the syllables are scheduled a little ahead at a time, so
   stopping (a skip, or leaving the screen) silences the rest at once */
export function speak(text, voiceId) {
  const tl = timeline(text, voiceId, VOICE_SPEEDS[state.settings?.voiceSpeed] || 1)
  const ctx = voicesOn() && !hiddenQuiet() ? audioContext() : null
  if (!ctx) return { timeline: tl, stop() {} }
  if (ctx.state === 'suspended') ctx.resume?.()
  const v = voiceOf(voiceId)
  const echo = echoOut(ctx, voiceOut(), v.echo)
  const start = ctx.currentTime + 0.05
  let next = 0, timer = null
  holdDuck(true)
  const pump = () => {
    const horizon = ctx.currentTime + 0.25
    while (next < tl.sylls.length && start + tl.sylls[next].t < horizon) syllable(ctx, echo.node, v, tl.sylls[next], start + tl.sylls[next++].t)
    if (next >= tl.sylls.length) stop()
  }
  function stop() {
    if (!timer) return
    clearInterval(timer); timer = null; echo.close()
    // The music comes back once the last syllable has rung
    setTimeout(() => holdDuck(false), 300)
  }
  timer = setInterval(pump, 80)
  pump()
  return { timeline: tl, stop }
}

// A line spoken into an offline context, to listen to a voice outside the game
export async function renderLine(text, voiceId, sampleRate = 44100) {
  const tl = timeline(text, voiceId)
  const off = new OfflineAudioContext(2, Math.round(sampleRate * (tl.length + 1.5)), sampleRate)
  const out = off.createGain()
  out.gain.value = 0.9
  out.connect(off.destination)
  const v = voiceOf(voiceId), echo = echoOut(off, out, v.echo)
  for (const s of tl.sylls) syllable(off, echo.node, v, s, 0.2 + s.t)
  const buf = await off.startRendering()
  return { channels: [buf.getChannelData(0), buf.getChannelData(1)], sampleRate }
}
