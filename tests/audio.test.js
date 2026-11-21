import { describe, it, expect } from 'vitest'
import { G, state, newHero } from './helpers.js'
import { moodFor, areaFor, areaAmbienceFor, MOOD_IDS } from '../src/game/music.js'
import { gateCue, cueSettings, setCue, SOUND_KINDS } from '../src/game/sound.js'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { applyProfile, saveCustomProfile, matchingProfile, resetAudio } from '../src/game/audioProfiles.js'
import { CUES, CUE_MAP, CUE_CATS, THEMES, STINGERS, ROOMS, SCREEN_THEMES, SKILL_THEMES, PROFILES, PROFILE_IDS, PACKS, PALETTES, GROUP_WINDOW, AREA_AMBIENCE } from '../src/game/data/audio.js'
import { AREAS } from '../src/game/data/combat.js'
import { SKILLS } from '../src/game/data/skills.js'
import { ACTIONS } from '../src/game/data/actions.js'
import { MODES } from '../src/game/audio/composer.js'
import { i18n } from '../src/i18n/index.js'

const te = k => i18n.global.te(k, 'en')

describe('music themes', () => {
  it('cover every screen, skill, fight and region of the game', () => {
    newHero()
    expect(MOOD_IDS.length).toBeGreaterThanOrEqual(30)
    for (const id of MOOD_IDS) {
      const th = THEMES[id]
      expect(MODES[th.mode], id).toBeTruthy()
      expect(th.prog.every(([d]) => d >= 1 && d <= 7), id).toBe(true)
      expect(th.scale.every(n => n >= 0 && n < 12)).toBe(true)
      expect(ROOMS[th.room], id).toBeTruthy()
      expect(te(`audio.themes.${id}`), id).toBe(true)
    }
    for (const id of [...Object.values(SCREEN_THEMES), ...Object.values(SKILL_THEMES)]) expect(THEMES[id], id).toBeTruthy()
    for (const skill of Object.keys(SKILLS)) if (ACTIONS[skill]) expect(SKILL_THEMES[skill], skill).toBeTruthy()
    // A fight on a fight screen sets the music
    state.activity = { type: 'combat', kind: 'area', target: 'bear' }
    expect(moodFor()).toBe('frozen')
    expect(moodFor(state, 'region')).toBe('frozen')
    expect(areaFor()).toBe('peaks')
    state.activity = { type: 'combat', kind: 'area', target: 'red_dragon' }
    expect(moodFor()).toBe('dragon')
    state.activity = { type: 'combat', kind: 'dungeon', target: 'crypt' }
    expect(moodFor()).toBe('dungeon')
    expect(areaFor()).toBe('dungeon')
    state.activity = { type: 'combat', kind: 'tower' }
    expect(moodFor()).toBe('tower')
    state.activity = { type: 'combat', kind: 'boss', target: 'kraken' }
    expect(moodFor()).toBe('boss')
    // Elsewhere each screen has its own theme, even while fighting
    expect(moodFor(state, 'tavern')).toBe('tavern')
    state.activity = null
    expect(moodFor(state, 'home')).toBe('hearth')
    expect(moodFor(state, 'farming')).toBe('farm')
    expect(moodFor(state, 'fishing')).toBe('waters')
    expect(moodFor(state, 'smithing')).toBe('workshop')
    expect(moodFor(state, 'hero')).toBe('hero')
    // Settings keep what is playing; unknown places follow the sky
    expect(moodFor(state, 'settings')).toBe(null)
    expect(moodFor(state, null, 'blizzard')).toBe('cold')
    expect(moodFor(state, null, 'clear')).toBe('calm')
    for (const k in STINGERS) expect(STINGERS[k].length).toBeGreaterThan(2)
  })

  it('give every region of the realm its own ambience', () => {
    for (const a of AREAS) expect(Object.keys(AREA_AMBIENCE[a.id] || {}).length, a.id).toBeGreaterThan(0)
    expect(areaAmbienceFor('dungeon')).toHaveProperty('drip')
    expect(areaAmbienceFor(null)).toEqual({})
  })
})

describe('alerts', () => {
  it('each have a sound, a category and their texts', () => {
    for (const c of CUES) {
      expect(CUE_CATS).toContain(c.cat)
      expect(te(`audio.cues.${c.id}.name`), c.id).toBe(true)
      expect(te(`audio.cues.${c.id}.desc`), c.id).toBe(true)
    }
    for (const cat of CUE_CATS) expect(te(`audio.cats.${cat}`)).toBe(true)
    for (const p of PACKS) expect(te(`audio.packs.${p}.name`)).toBe(true)
    for (const p of PALETTES) expect(te(`audio.palettes.${p}.name`)).toBe(true)
    // Every alert, and every sound a screen asks for, has a design
    for (const c of CUES) expect(SOUND_KINDS, c.id).toContain(c.sound)
    const walk = d => readdirSync(d).flatMap(f => (statSync(d + '/' + f).isDirectory() ? walk(d + '/' + f) : [d + '/' + f]))
    const asked = new Set(walk('src').filter(f => /\.(js|vue)$/.test(f)).flatMap(f => [...readFileSync(f, 'utf8').matchAll(/\bplay\('([a-z]+)'\)/g)].map(m => m[1])))
    for (const k of asked) expect(SOUND_KINDS, k).toContain(k)
  })

  it('wait between repeats and fold a burst into one sound', () => {
    const memo = {}
    const level = CUE_MAP.levelUp
    expect(gateCue(memo, level, 1000)).toBe('play')
    expect(gateCue(memo, level, 1100)).toBe('hold')
    expect(gateCue(memo, level, 1200)).toBe('hold')
    expect(memo.levelUp.held).toBe(2)
    expect(gateCue(memo, level, 1000 + GROUP_WINDOW + 1)).toBe('play')
    expect(memo.levelUp.held).toBe(0)
    // An alert that is not grouped is simply skipped while it is too soon
    const ach = CUE_MAP.achievement
    expect(gateCue(memo, ach, 5000)).toBe('play')
    expect(gateCue(memo, ach, 5000 + ach.gap - 1)).toBe('skip')
    expect(gateCue(memo, ach, 5000 + ach.gap)).toBe('play')
  })

  it('keep the player’s own settings over the catalogue’s', () => {
    newHero()
    expect(cueSettings('pet')).toMatchObject({ on: true, vol: 100, bg: true })
    expect(cueSettings('ui')).toMatchObject({ bg: false })
    setCue('pet', { vol: 40 })
    setCue('pet', { bg: false })
    expect(cueSettings('pet')).toMatchObject({ on: true, vol: 40, bg: false })
  })
})

describe('sound profiles', () => {
  it('set the mix in one go and are recognised afterwards', () => {
    newHero()
    expect(matchingProfile()).toBe('classic')
    for (const id of PROFILE_IDS) {
      expect(applyProfile(id)).toBe(true)
      expect(matchingProfile()).toBe(id)
      expect(te(`audio.profiles.${id}.name`)).toBe(true)
      for (const off of PROFILES[id].cuesOff) expect(cueSettings(off).on).toBe(false)
    }
    applyProfile('alerts')
    expect(state.settings.music).toBe(false)
    state.settings.musicVol = 12
    expect(matchingProfile()).toBe(null)
  })

  it('keep one of the player’s own and reset the rest', () => {
    newHero()
    applyProfile('night')
    state.settings.sfxVol = 33
    saveCustomProfile()
    expect(matchingProfile()).toBe('custom')
    applyProfile('classic')
    expect(applyProfile('custom')).toBe(true)
    expect(state.settings.sfxVol).toBe(33)
    resetAudio()
    expect(state.settings.sfxVol).toBe(70)
    expect(state.settings.customProfile.sfxVol).toBe(33)
    expect(matchingProfile()).toBe('classic')
  })

  it('reach older saves with their defaults', () => {
    newHero()
    G.loadSave({ ...JSON.parse(JSON.stringify(state)), settings: { sound: false, musicVol: 20 } })
    expect(state.settings).toMatchObject({ sound: false, musicVol: 20, sfxPack: 'classic', palette: 'soft', musicMode: 'auto', cues: {}, subtitles: false })
  })
})
