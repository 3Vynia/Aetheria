import { describe, it, expect, vi } from 'vitest'
import { G, state, newHero, setLevel, run } from './helpers.js'
import { RACES, RACE_IDS, DEFAULT_RACE, HOME_DMG, HOME_LOOT, RIVAL_DMG } from '../src/game/data/races.js'
import { MONSTERS, BOSSES } from '../src/game/data/combat.js'

const hero = race => newHero({ race })

describe('races', () => {
  it('are seven, each from a region of the realm', () => {
    expect(RACE_IDS).toEqual(['human', 'dwarf', 'elf', 'bogkin', 'frostborn', 'drakeborn', 'starborn'])
    expect(DEFAULT_RACE).toBe('human')
    for (const id of RACE_IDS) expect(RACES[id].name, id).toBeTruthy()
  })

  it('start a new hero as the race chosen, and an unknown one as human', () => {
    expect(hero('dwarf').race).toBe('dwarf')
    expect(hero('orc').race).toBe('human')
  })

  it('add their bonuses and their drawback to the modifiers', () => {
    hero('dwarf')
    expect(G.raceMods('speed.mining')).toBeCloseTo(0.1)
    expect(G.raceMods('magicDmg')).toBeCloseTo(-0.1)
    expect(G.mod('speed.smithing')).toBeGreaterThanOrEqual(0.1)
    expect(G.modSources('defense').some(s => s.src === 'race')).toBe(true)
    hero('human')
    expect(G.raceMods('xp')).toBeCloseTo(0.05)
    expect(G.raceMods('magicDmg')).toBe(0)
  })

  it('change maximum health by a share of it that never leaves less than 1', () => {
    const base = () => G.level('hitpoints') + Math.floor(G.mod('maxHp'))
    hero('starborn')
    setLevel('hitpoints', 10)
    expect(G.maxHp()).toBe(Math.round(base() * 0.92))
    expect(G.maxHp()).toBeLessThan(base())
    hero('frostborn')
    setLevel('hitpoints', 50)
    expect(G.maxHp()).toBe(Math.round(base() * 1.08))
    hero('human')
    setLevel('hitpoints', 50)
    expect(G.maxHp()).toBe(base())
    hero('elf')
    setLevel('hitpoints', 1)
    state.hero.attrs.vit = 0
    vi.spyOn(G, 'mod').mockReturnValue(-50)
    expect(G.maxHp()).toBe(1)
  })

  it('give humans two more talent points', () => {
    hero('human')
    const human = G.talentPoints()
    hero('elf')
    expect(human - G.talentPoints()).toBe(2)
  })

  it('let the forge pulse in dwarven hands', () => {
    hero('dwarf')
    const dwarf = G.doubleChance('smithing', 'bronze_bar')
    hero('elf')
    expect(dwarf - G.doubleChance('smithing', 'bronze_bar')).toBeCloseTo(0.06)
  })

  it('never let drakeborn burn food', () => {
    const fish = { lvl: 1 }
    hero('drakeborn')
    expect(G.burnChance('cooking', fish)).toBe(0)
    hero('elf')
    expect(G.burnChance('cooking', fish)).toBeGreaterThan(0)
  })

  it('heal bogkin twice as fast out of combat', () => {
    const regen = race => {
      hero(race)
      setLevel('hitpoints', 40)
      state.hp = 1
      run(30, 1)
      return state.hp - 1
    }
    expect(regen('bogkin')).toBe(2 * regen('elf'))
  })

  it('keep frostborn going longer while away', () => {
    hero('frostborn')
    const frost = G.offlineCapHours()
    hero('elf')
    expect(frost - G.offlineCapHours()).toBeCloseTo(2 * G.diff().offline)
  })

  it('show starborn more omens', () => {
    hero('starborn')
    expect(G.raceOmenMult()).toBeCloseTo(1.25)
    hero('dwarf')
    expect(G.raceOmenMult()).toBe(1)
  })

  it('fight better at home and worse in the rival land, and not against bosses', () => {
    hero('elf')
    const wolf = MONSTERS.wolf, dragon = Object.values(MONSTERS).find(m => m.area === 'lair'), cow = MONSTERS.cow
    expect(G.homeEffect(wolf, 'dmg')).toBeCloseTo(HOME_DMG)
    expect(G.homeEffect(wolf, 'loot')).toBeCloseTo(HOME_LOOT)
    expect(G.homeEffect(dragon, 'dmg')).toBeCloseTo(RIVAL_DMG)
    expect(G.homeEffect(dragon, 'loot')).toBe(0)
    expect(G.homeEffect(cow, 'dmg')).toBe(0)
    expect(G.homeEffect(BOSSES[0], 'dmg')).toBe(0)
    state.activity = { type: 'combat', kind: 'area', target: 'wolf' }
    const home = G.playerStatsNow(wolf).maxHit
    hero('dwarf')
    setLevel('attack', 1)
    expect(home).toBeGreaterThanOrEqual(G.playerStatsNow(wolf).maxHit)
  })

  it('turn a save from before races into a human one', () => {
    newHero()
    const old = JSON.parse(JSON.stringify(state))
    delete old.race
    G.loadSave(old)
    expect(state.race).toBe('human')
  })
})

describe('racial talents', () => {
  it('are three for every race, at hero levels 10, 20 and 30', async () => {
    const { TALENTS } = await import('../src/game/data/character.js')
    for (const id of RACE_IDS) expect(TALENTS.filter(t => t.race === id).map(t => t.lvl), id).toEqual([10, 20, 30])
  })

  it('can only be learnt by their own race', async () => {
    const { TALENTS } = await import('../src/game/data/character.js')
    const dwarven = TALENTS.find(t => t.race === 'dwarf' && t.lvl === 10)
    hero('elf')
    state.hero.xp = 1e9
    expect(G.canLearn(dwarven)).toBe(false)
    hero('dwarf')
    state.hero.xp = 1e9
    expect(G.canLearn(dwarven)).toBe(true)
    expect(G.learnTalent(dwarven.id)).toBe(true)
    expect(G.mod(dwarven.mod)).toBeGreaterThanOrEqual(dwarven.per)
  })
})

describe('races across lives', () => {
  const ascendable = () => { for (const s of Object.keys(state.skills)) setLevel(s, 60) }

  it('let the hero be born again as another race, and keep the one left behind as a legacy', () => {
    hero('dwarf')
    ascendable()
    expect(G.ascend(null, 'elf')).toBeGreaterThan(0)
    expect(state.race).toBe('elf')
    expect(state.ascension.races).toEqual({ dwarf: 1 })
    expect(G.raceLegacy()).toBeCloseTo(0.01)
    ascendable()
    G.ascend()
    expect(state.race).toBe('elf')
    expect(state.ascension.races).toEqual({ dwarf: 1, elf: 1 })
    expect(G.raceMods('xp')).toBeCloseTo(0.02)
  })

  it('give back the talents of the race left behind', async () => {
    const { TALENTS } = await import('../src/game/data/character.js')
    hero('dwarf')
    ascendable()
    state.hero.xp = 1e9
    G.learnTalent(TALENTS.find(t => t.race === 'dwarf').id)
    G.ascend(null, 'elf')
    expect(Object.keys(state.hero.talents)).toEqual([])
    expect(G.talentPoints()).toBeGreaterThanOrEqual(0)
  })

  it('count the lives of a save from before races as human ones', () => {
    newHero()
    const old = JSON.parse(JSON.stringify(state))
    delete old.race
    old.ascension.count = 3
    delete old.ascension.races
    G.loadSave(old)
    expect(state.ascension.races).toEqual({ human: 3 })
    newHero()
    expect(state.ascension.races).toEqual({})
  })

  it('stop the legacy at every race once', () => {
    hero('human')
    state.ascension.races = Object.fromEntries(RACE_IDS.map(id => [id, 2]))
    expect(G.raceLegacy()).toBeCloseTo(0.07)
  })
})

describe('races in the story', () => {
  it('give every race its own line on the first page, a word from the keeper and from three people', async () => {
    const { rumorsFor, talksFor } = await import('../src/game/data/journal.js')
    const { te } = await import('../src/i18n/index.js')
    for (const id of RACE_IDS) {
      hero(id)
      expect(te(`races.${id}.memory`), id).toBe(true)
      expect(rumorsFor(G).map(r => r.id), id).toContain(`born_${id}`)
      for (const other of RACE_IDS.filter(o => o !== id)) expect(rumorsFor(G).map(r => r.id)).not.toContain(`born_${other}`)
      for (const who of ['astrologer', 'smith', 'morwen']) {
        const ids = talksFor(G, who).map(l => l.id)
        expect(ids, `${who} ${id}`).toContain(`race_${id}`)
        expect(te(`journal.talk.${who}.race_${id}`)).toBe(true)
      }
    }
  })

  it('bring back a memory of each race a life was completed with, beside the memories of every life', async () => {
    const { MEMORIES } = await import('../src/game/data/journal.js')
    const raceMemory = id => MEMORIES.find(m => m.race === id)
    expect(MEMORIES.filter(m => m.n).map(m => m.id)).toEqual(['life1', 'life2', 'life3', 'life4', 'life5'])
    hero('dwarf')
    expect(G.memoryUnlocked(raceMemory('dwarf'))).toBe(false)
    for (const s of Object.keys(state.skills)) setLevel(s, 60)
    G.ascend(null, 'elf')
    expect(G.memoryUnlocked(raceMemory('dwarf'))).toBe(true)
    expect(G.memoryUnlocked(raceMemory('elf'))).toBe(false)
    expect(G.memoryUnlocked(MEMORIES.find(m => m.id === 'life1'))).toBe(true)
  })
})

describe('races, reviewed', () => {
  it('let the newest story beat speak before the word about the hero\'s people', async () => {
    const { rumorsFor, talksFor } = await import('../src/game/data/journal.js')
    hero('dwarf')
    expect(rumorsFor(G).at(-1).id).not.toMatch(/^born_/)
    for (const who of ['astrologer', 'smith', 'morwen']) expect(talksFor(G, who).at(-1).id, who).not.toMatch(/^race_/)
  })

  it('never give the hero a gender in Spanish, and count lives properly', async () => {
    const { default: es } = await import('../src/i18n/locales/es.js')
    const { i18n } = await import('../src/i18n/index.js')
    const { TALENTS } = await import('../src/game/data/character.js')
    const raceTalents = TALENTS.filter(t => t.race).map(t => es.talents[t.id])
    const texts = [...Object.values(es.races).flatMap(r => (typeof r === 'object' ? Object.values(r) : [r])), es.ascension.confirmRace, ...raceTalents,
      ...Object.values(es.journal.talk.morwen)]
    for (const s of texts) expect(s, s).not.toMatch(/\b(Nacido|nacido|Tocado|tocado|Pescador|Observador|pequeña rana|como \{race\})\b/)
    expect(i18n.global.t('ascension.raceLivedOne')).toBe('One life lived')
    expect(i18n.global.t('ascension.raceLived', { n: 3 })).toBe('3 lives lived')
    expect(i18n.global.t('ascension.confirmRace', { race: 'Elf' })).not.toMatch(/\ba Elf\b/)
  })
})
