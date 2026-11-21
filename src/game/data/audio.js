/*
  Everything the sound settings are made of, as plain data: the alerts the game can play, the music
  themes, the sound packs and palettes, and the quick profiles. The sound itself lives in music.js
  (music and ambience) and sound.js (effects and the alert manager).
*/

/* ---------------- alerts ---------------- */
// cat: where it is listed · sound: which effect it plays · prio: high alerts duck the music and win a
// crowded moment, low ones give way · gap: shortest time between two of them (ms) · group: a burst
// becomes a single sound · bg: heard with the tab hidden by default · stinger: a short musical phrase
// played instead of the effect while the music is on · caption: a line for sound captions
export const CUE_CATS = ['progress', 'loot', 'combat', 'world', 'town', 'system']
const cue = (id, cat, sound, o = {}) => ({ id, cat, sound, prio: 'normal', gap: 250, group: false, bg: false, ...o })
export const CUES = [
  cue('levelUp', 'progress', 'level', { prio: 'low', gap: 600, group: true }),
  cue('heroLevel', 'progress', 'quest', { prio: 'high', bg: true, stinger: 'rise' }),
  cue('achievement', 'progress', 'quest', { gap: 800 }),
  cue('quest', 'progress', 'quest'),
  cue('chapter', 'progress', 'quest', { prio: 'high', stinger: 'chapter' }),
  cue('dailyStreak', 'progress', 'quest'),
  cue('guildRank', 'progress', 'level'),
  cue('shard', 'progress', 'rare', { prio: 'high', bg: true, stinger: 'chapter' }),
  cue('rareDrop', 'loot', 'rare', { gap: 400, group: true }),
  cue('masterwork', 'loot', 'rare'),
  cue('hybrid', 'loot', 'rare'),
  cue('pet', 'loot', 'rare', { prio: 'high', bg: true, stinger: 'rise' }),
  cue('petEgg', 'loot', 'rare', { prio: 'high', bg: true }),
  cue('petLevel', 'loot', 'level', { prio: 'low', gap: 800 }),
  cue('elite', 'combat', 'rare', { gap: 600 }),
  cue('huntStreak', 'combat', 'quest', { prio: 'low' }),
  cue('death', 'combat', 'bad', { prio: 'high', stinger: 'fall' }),
  cue('retreat', 'combat', 'bad'),
  cue('dungeon', 'combat', 'rare', { stinger: 'victory' }),
  cue('guardian', 'combat', 'rare', { stinger: 'victory' }),
  cue('weeklyKill', 'combat', 'quest', { prio: 'high', bg: true, stinger: 'victory' }),
  cue('jailed', 'combat', 'bad'),
  cue('omen', 'world', 'rare', { prio: 'high', bg: true }),
  cue('boon', 'world', 'quest'),
  cue('wish', 'world', 'rare'),
  cue('expedition', 'town', 'quest', { bg: true }),
  cue('unpaid', 'town', 'bad', { bg: true }),
  cue('queueDone', 'system', 'coin', { bg: true }),
  cue('weather', 'system', 'coin', { prio: 'low', gap: 5000 }),
  // Buttons and small actions on screen: buying, claiming, hiring…
  cue('ui', 'system', 'coin', { prio: 'low', gap: 60 }),
]
export const CUE_MAP = Object.fromEntries(CUES.map(c => [c.id, c]))
export const CUE_LIMIT = { desktop: 48, mobile: 24 } // effect voices playing at once
export const GROUP_WINDOW = 700 // ms in which a burst of the same alert counts as one

/* ---------------- packs and palettes ---------------- */
export const PACKS = ['classic', 'crystal', 'minimal']
export const PALETTES = ['soft', 'harp', 'retro']

/* ---------------- music themes ---------------- */
// Each theme is a piece the composer (audio/composer.js) plays on and on, always in its own key and
// mood. root: MIDI note of the key · mode · bpm · meter: 4, 3 or 6 (6/8) · prog / progB: chords of the
// two halves, as scale degrees ([degree, seventh?]) · pad, bass, accomp, lead: who plays each part ·
// perc: drums when the intensity is high (fights) · percLow: a softer pulse the rest of the time ·
// swing · room: the space it is heard in (ROOMS) · bright: how open the pads sound · level: evens out
// how loud the themes are (measured renders, aimed at the same loudness)
const T = (o) => ({ meter: 4, swing: 0, bright: 2400, level: 1, ...o })
export const THEMES = {
  // The realm: exploring, fighting and its regions
  calm: T({ level: 0.57, root: 53, mode: 'ionian', bpm: 66, prog: [[1], [5], [6], [4, 1]], progB: [[4], [1], [2, 1], [5]], pad: 'strings', bass: { instr: 'deep', pattern: 'drone' }, accomp: { instr: 'harp', pattern: 'arp', thin: true }, lead: { instr: 'flute', center: 74 }, room: 'hall', bright: 1900 }),
  voyage: T({ level: 1.51, root: 55, mode: 'mixolydian', bpm: 84, meter: 6, prog: [[1], [7], [4], [1]], progB: [[6], [4], [5], [1]], pad: 'strings', bass: { instr: 'bass', pattern: 'root' }, accomp: { instr: 'lute', pattern: 'arp' }, lead: { instr: 'horn', center: 69 }, percLow: 'soft', perc: 'jig', room: 'field' }),
  adventure: T({ level: 1.51, root: 52, mode: 'mixolydian', bpm: 92, prog: [[1], [7], [4], [1]], progB: [[6], [4], [1], [5]], pad: 'strings', bass: { instr: 'bass', pattern: 'root' }, accomp: { instr: 'lute', pattern: 'strum' }, lead: { instr: 'horn', center: 69 }, percLow: 'soft', perc: 'march', room: 'field' }),
  dark: T({ level: 1.0, root: 45, mode: 'phrygian', bpm: 70, prog: [[1], [2], [1], [7]], progB: [[6], [7], [1], [1]], pad: 'choir', bass: { instr: 'cello', pattern: 'drone' }, accomp: { instr: 'harp', pattern: 'sparse' }, lead: { instr: 'strings', center: 64 }, percLow: 'heart', perc: 'war', room: 'cave', bright: 1300 }),
  cold: T({ level: 0.55, root: 47, mode: 'dorian', bpm: 62, meter: 3, prog: [[1], [7], [6], [4]], progB: [[3], [7], [4], [1]], pad: 'strings', bass: { instr: 'deep', pattern: 'drone' }, accomp: { instr: 'celesta', pattern: 'arp', thin: true }, lead: { instr: 'flute', center: 76 }, room: 'ice', bright: 2800 }),
  frozen: T({ level: 1.14, root: 49, mode: 'aeolian', bpm: 74, prog: [[1], [6], [7], [4]], progB: [[3], [7], [1], [5]], pad: 'strings', bass: { instr: 'cello', pattern: 'root' }, accomp: { instr: 'celesta', pattern: 'arp' }, lead: { instr: 'flute', center: 76 }, percLow: 'heart', perc: 'war', room: 'ice', bright: 3000 }),
  ominous: T({ level: 0.55, root: 48, mode: 'harmonic', bpm: 56, prog: [[1], [6], [1], [5, 1]], progB: [[4], [6], [2], [5, 1]], pad: 'choir', bass: { instr: 'deep', pattern: 'drone' }, accomp: { instr: 'bell', pattern: 'sparse', octave: 12 }, lead: { instr: 'strings', center: 62 }, percLow: 'heart', perc: 'war', room: 'abyss', bright: 1100 }),
  celestial: T({ level: 0.6, root: 53, mode: 'lydian', bpm: 64, prog: [[1], [2], [7], [1, 1]], progB: [[3], [2], [5], [1]], pad: 'choir', bass: { instr: 'deep', pattern: 'drone' }, accomp: { instr: 'celesta', pattern: 'arp' }, lead: { instr: 'bell', center: 79 }, percLow: 'soft', perc: 'war', room: 'cathedral', bright: 3800 }),
  dragon: T({ level: 0.75, root: 44, mode: 'phrygian', bpm: 96, prog: [[1], [7], [6], [7]], progB: [[2], [1], [6], [5]], pad: 'choir', bass: { instr: 'cello', pattern: 'pulse' }, accomp: { instr: 'strings', pattern: 'pulse', octave: -12 }, lead: { instr: 'horn', center: 64 }, percLow: 'heart', perc: 'war', room: 'cave', bright: 1500 }),
  dungeon: T({ level: 1.08, root: 43, mode: 'harmonic', bpm: 76, prog: [[1], [6], [4], [5]], progB: [[1], [3], [6], [5, 1]], pad: 'organ', bass: { instr: 'cello', pattern: 'drone' }, accomp: { instr: 'harp', pattern: 'sparse' }, lead: { instr: 'strings', center: 64 }, percLow: 'heart', perc: 'war', room: 'crypt', bright: 1000 }),
  tower: T({ level: 0.85, root: 50, mode: 'dorian', bpm: 100, prog: [[1], [4], [7], [3]], progB: [[6], [7], [1], [5]], pad: 'strings', bass: { instr: 'cello', pattern: 'pulse' }, accomp: { instr: 'lute', pattern: 'pulse' }, lead: { instr: 'horn', center: 67 }, percLow: 'soft', perc: 'war', room: 'hall', bright: 2000 }),
  boss: T({ level: 0.69, root: 41, mode: 'harmonic', bpm: 116, prog: [[1], [6], [4], [5]], progB: [[1], [2], [6], [5, 1]], pad: 'choir', bass: { instr: 'cello', pattern: 'pulse' }, accomp: { instr: 'strings', pattern: 'pulse', octave: -12 }, lead: { instr: 'horn', center: 65 }, percLow: 'war', perc: 'war', room: 'hall', bright: 1400 }),
  // The town
  town: T({ level: 1.23, root: 55, mode: 'ionian', bpm: 108, meter: 6, prog: [[1], [4], [5], [1]], progB: [[6], [4], [2], [5]], pad: 'warm', bass: { instr: 'bass', pattern: 'root' }, accomp: { instr: 'lute', pattern: 'strum' }, lead: { instr: 'flute', center: 76 }, percLow: 'jig', perc: 'jig', room: 'tavern' }),
  tavern: T({ level: 1.27, root: 50, mode: 'dorian', bpm: 116, meter: 6, prog: [[1], [7], [1], [5]], progB: [[3], [7], [4], [1]], pad: 'warm', bass: { instr: 'bass', pattern: 'root' }, accomp: { instr: 'lute', pattern: 'strum' }, lead: { instr: 'flute', center: 74 }, percLow: 'jig', perc: 'jig', room: 'tavern' }),
  market: T({ level: 1.23, root: 57, mode: 'mixolydian', bpm: 104, swing: 0.5, prog: [[1], [7], [4], [1]], progB: [[4], [1], [2], [5]], pad: 'warm', bass: { instr: 'bass', pattern: 'walk' }, accomp: { instr: 'lute', pattern: 'alberti' }, lead: { instr: 'flute', center: 74 }, percLow: 'soft', perc: 'march', room: 'street' }),
  guild: T({ level: 1.06, root: 48, mode: 'aeolian', bpm: 92, prog: [[1], [6], [3], [7]], progB: [[4], [5], [1], [5]], pad: 'strings', bass: { instr: 'cello', pattern: 'root' }, accomp: { instr: 'lute', pattern: 'pulse' }, lead: { instr: 'horn', center: 67 }, percLow: 'march', perc: 'march', room: 'hall', bright: 2100 }),
  hearth: T({ level: 1.28, root: 58, mode: 'ionian', bpm: 78, meter: 3, prog: [[1], [6], [2, 1], [5]], progB: [[4], [3], [2], [5, 1]], pad: 'warm', bass: { instr: 'bass', pattern: 'root' }, accomp: { instr: 'harp', pattern: 'arp' }, lead: { instr: 'flute', center: 77 }, percLow: 'waltz', perc: 'waltz', room: 'room', bright: 2200 }),
  chapel: T({ level: 0.54, root: 51, mode: 'lydian', bpm: 56, prog: [[1], [5], [2], [1]], progB: [[6], [2], [5], [1]], pad: 'organ', bass: { instr: 'deep', pattern: 'drone' }, lead: { instr: 'choir', center: 67 }, room: 'cathedral', bright: 2600 }),
  festival: T({ level: 1.18, root: 55, mode: 'ionian', bpm: 124, meter: 6, prog: [[1], [5], [1], [4]], progB: [[6], [4], [5], [1]], pad: 'warm', bass: { instr: 'bass', pattern: 'root' }, accomp: { instr: 'lute', pattern: 'strum' }, lead: { instr: 'flute', center: 79 }, percLow: 'jig', perc: 'jig', room: 'field' }),
  // Work and skills
  labour: T({ level: 1.36, root: 52, mode: 'dorian', bpm: 96, prog: [[1], [4], [1], [7]], progB: [[3], [4], [6], [7]], pad: 'strings', bass: { instr: 'bass', pattern: 'pulse' }, accomp: { instr: 'lute', pattern: 'pulse' }, lead: { instr: 'flute', center: 72 }, percLow: 'work', perc: 'work', room: 'field', bright: 2000 }),
  workshop: T({ level: 1.0, root: 57, mode: 'dorian', bpm: 100, prog: [[1], [4], [7], [1]], progB: [[6], [7], [4], [5]], pad: 'warm', bass: { instr: 'cello', pattern: 'root' }, accomp: { instr: 'lute', pattern: 'alberti' }, lead: { instr: 'flute', center: 74 }, percLow: 'work', perc: 'work', room: 'workshop' }),
  farm: T({ level: 1.28, root: 53, mode: 'ionian', bpm: 88, meter: 6, prog: [[1], [6], [4], [5]], progB: [[4], [1], [2], [5]], pad: 'warm', bass: { instr: 'bass', pattern: 'root' }, accomp: { instr: 'lute', pattern: 'arp' }, lead: { instr: 'flute', center: 76 }, percLow: 'soft', perc: 'jig', room: 'field' }),
  waters: T({ level: 0.81, root: 53, mode: 'ionian', bpm: 66, meter: 6, prog: [[1], [4], [6], [5]], progB: [[2], [5], [3], [6]], pad: 'strings', bass: { instr: 'deep', pattern: 'root' }, accomp: { instr: 'harp', pattern: 'arp' }, lead: { instr: 'flute', center: 74 }, room: 'field', bright: 2600 }),
  stealth: T({ level: 0.88, root: 45, mode: 'phrygian', bpm: 84, prog: [[1], [2], [7], [1]], progB: [[6], [5], [2], [1]], pad: 'strings', bass: { instr: 'cello', pattern: 'pulse' }, accomp: { instr: 'pizz', pattern: 'alberti' }, lead: { instr: 'strings', center: 62 }, percLow: 'soft', perc: 'heart', room: 'street', bright: 1500 }),
  // Story, collections and the hero
  hero: T({ level: 1.06, root: 50, mode: 'dorian', bpm: 84, prog: [[1], [7], [4], [1]], progB: [[3], [4], [6], [5]], pad: 'strings', bass: { instr: 'cello', pattern: 'root' }, accomp: { instr: 'harp', pattern: 'arp' }, lead: { instr: 'horn', center: 67 }, percLow: 'soft', perc: 'march', room: 'hall' }),
  chronicle: T({ level: 0.93, root: 52, mode: 'aeolian', bpm: 72, prog: [[1], [6], [3], [7]], progB: [[4], [1], [6], [5]], pad: 'strings', bass: { instr: 'deep', pattern: 'root' }, accomp: { instr: 'harp', pattern: 'arp' }, lead: { instr: 'strings', center: 72 }, room: 'hall', bright: 2200 }),
  library: T({ level: 0.48, root: 48, mode: 'lydian', bpm: 70, prog: [[1], [2], [1], [5]], progB: [[6], [2], [3], [5]], pad: 'warm', bass: { instr: 'deep', pattern: 'drone' }, accomp: { instr: 'celesta', pattern: 'arp', thin: true }, lead: { instr: 'harp', center: 76 }, room: 'library', bright: 2600 }),
  playful: T({ level: 1.36, root: 57, mode: 'ionian', bpm: 112, swing: 0.5, prog: [[1], [6], [2], [5]], progB: [[4], [5], [3], [6]], pad: 'warm', bass: { instr: 'bass', pattern: 'walk' }, accomp: { instr: 'pizz', pattern: 'alberti' }, lead: { instr: 'celesta', center: 79 }, percLow: 'soft', perc: 'soft', room: 'room' }),
  starlight: T({ level: 0.57, root: 54, mode: 'lydian', bpm: 60, prog: [[1], [2], [1], [7]], progB: [[3], [2], [5], [1]], pad: 'choir', bass: { instr: 'deep', pattern: 'drone' }, accomp: { instr: 'celesta', pattern: 'sparse', octave: 12 }, lead: { instr: 'bell', center: 79 }, room: 'cathedral', bright: 3400 }),
  rebirth: T({ level: 0.52, root: 49, mode: 'lydian', bpm: 54, prog: [[1], [5], [6], [4]], progB: [[2], [5], [3], [1]], pad: 'choir', bass: { instr: 'deep', pattern: 'drone' }, accomp: { instr: 'harp', pattern: 'arp', thin: true }, lead: { instr: 'strings', center: 72 }, room: 'abyss', bright: 3000 }),
}
for (const id in THEMES) {
  THEMES[id].id = id
  // The notes of the mode, for anything that only needs the scale
  THEMES[id].scale = { ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11] }[THEMES[id].mode]
}
export const THEME_IDS = Object.keys(THEMES)
// The theme of each screen, and of each skill's screen. Screens left out keep what is playing
export const SCREEN_THEMES = {
  hero: 'hero', inventory: 'market', shop: 'market', forge: 'workshop', combat: 'voyage', region: 'voyage', slayer: 'guild',
  tower: 'tower', weekly: 'ominous', quests: 'chronicle', journal: 'chronicle', crown: 'chronicle', achievements: 'library',
  stats: 'library', bestiary: 'library', routines: 'library', ascension: 'rebirth', omens: 'starlight', festival: 'festival',
  pets: 'playful', guilds: 'guild', tavern: 'tavern', home: 'hearth', church: 'chapel',
}
export const SKILL_THEMES = {
  mining: 'labour', woodcutting: 'labour', agility: 'labour', fishing: 'waters', farming: 'farm', thieving: 'stealth', prayer: 'chapel',
  smithing: 'workshop', crafting: 'workshop', fletching: 'workshop', cooking: 'workshop', firemaking: 'workshop', herblore: 'workshop', runecrafting: 'workshop',
}
// The spaces music is heard in (see roomImpulse in audio/dsp.js); wet: how much of it reaches the ear
export const ROOMS = {
  hall: { decay: 2.6, predelay: 22, damp: 0.55, early: 0.4, wet: 0.32 },
  cathedral: { decay: 4.8, predelay: 38, damp: 0.45, early: 0.3, wet: 0.42 },
  abyss: { decay: 6.5, predelay: 60, damp: 0.75, early: 0.15, wet: 0.45 },
  cave: { decay: 3.4, predelay: 30, damp: 0.7, early: 0.65, wet: 0.38 },
  crypt: { decay: 2.9, predelay: 16, damp: 0.75, early: 0.7, wet: 0.36 },
  ice: { decay: 3.6, predelay: 26, damp: 0.25, early: 0.45, wet: 0.36 },
  field: { decay: 1.3, predelay: 10, damp: 0.6, early: 0.2, wet: 0.18 },
  tavern: { decay: 0.9, predelay: 6, damp: 0.7, early: 0.8, wet: 0.22 },
  room: { decay: 0.8, predelay: 5, damp: 0.6, early: 0.7, wet: 0.2 },
  library: { decay: 1.1, predelay: 8, damp: 0.75, early: 0.55, wet: 0.2 },
  workshop: { decay: 1.2, predelay: 7, damp: 0.5, early: 0.85, wet: 0.24 },
  street: { decay: 1.0, predelay: 12, damp: 0.55, early: 0.5, wet: 0.2 },
}
// Short phrases over the current key: degrees from the root, in beats
export const STINGERS = {
  rise: [[0, 0], [4, 0.5], [7, 1], [12, 1.5]],
  victory: [[0, 0], [7, 0.33], [12, 0.66], [16, 1], [19, 1.5]],
  chapter: [[0, 0], [7, 0.75], [5, 1.5], [12, 2.25]],
  fall: [[7, 0], [3, 0.5], [0, 1], [-5, 1.6]],
}

/* ---------------- ambience by area ---------------- */
// What each region of the realm sounds like, on top of the weather
export const AREA_AMBIENCE = {
  meadow: { brook: 0.5, bees: 0.4 }, forest: { leaves: 0.6, owl: 0.5 }, caves: { drip: 0.8 }, swamp: { frogs: 0.7, bubbles: 0.5 },
  ruins: { whisper: 0.5 }, peaks: { chimes: 0.6 }, lair: { breath: 0.7 }, abyss: { drone: 0.7 }, void: { drone: 0.9 },
  celestial: { shimmer: 0.7 },
}
export const DUNGEON_AMBIENCE = { drip: 0.6, whisper: 0.3 }

/* ---------------- profiles ---------------- */
// Quick sets of sound settings; `cues` turns off whole kinds of alerts
const quiet = ['levelUp', 'petLevel', 'huntStreak', 'weather', 'ui', 'achievement', 'rareDrop']
export const PROFILES = {
  classic: { masterVol: 80, music: true, musicVol: 45, ambience: true, ambienceVol: 50, sound: true, sfxVol: 70, sfxPack: 'classic', palette: 'soft', tempo: 100, density: 60, softTone: false, cuesOff: [] },
  night: { masterVol: 45, music: true, musicVol: 30, ambience: true, ambienceVol: 40, sound: true, sfxVol: 45, sfxPack: 'minimal', palette: 'soft', tempo: 85, density: 40, softTone: true, cuesOff: ['ui', 'weather'] },
  focus: { masterVol: 70, music: true, musicVol: 35, ambience: true, ambienceVol: 45, sound: true, sfxVol: 55, sfxPack: 'minimal', palette: 'soft', tempo: 80, density: 30, softTone: false, cuesOff: quiet },
  alerts: { masterVol: 80, music: false, musicVol: 45, ambience: false, ambienceVol: 50, sound: true, sfxVol: 75, sfxPack: 'classic', palette: 'soft', tempo: 100, density: 60, softTone: false, cuesOff: ['ui', 'weather'] },
  cinematic: { masterVol: 85, music: true, musicVol: 65, ambience: true, ambienceVol: 60, sound: true, sfxVol: 70, sfxPack: 'crystal', palette: 'harp', tempo: 100, density: 85, softTone: false, cuesOff: [] },
  minimal: { masterVol: 70, music: false, musicVol: 45, ambience: true, ambienceVol: 30, sound: true, sfxVol: 50, sfxPack: 'minimal', palette: 'soft', tempo: 100, density: 60, softTone: false, cuesOff: quiet },
}
export const PROFILE_IDS = Object.keys(PROFILES)

// Sound settings and their defaults; older saves get them on load
export const AUDIO_DEFAULTS = {
  sfxPack: 'classic', palette: 'soft', tempo: 100, density: 60, musicMode: 'auto', musicTheme: 'calm', areaAmbience: true,
  subtitles: false, visualCues: true, softTone: false, mono: false, cues: {}, audioProfile: 'classic', customProfile: null,
}
// The settings a profile is made of, so a custom one can be saved and compared
export const PROFILE_KEYS = Object.keys(PROFILES.classic).filter(k => k !== 'cuesOff')
