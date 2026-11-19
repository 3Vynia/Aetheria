import { describe, it, expect, afterEach, vi } from 'vitest'
import { G, state, newHero, setLevel, run } from './helpers.js'
import { findAction, ACTIONS } from '../src/game/data/actions.js'
import { ITEMS, CROPS } from '../src/game/data/items.js'
import { SKILLS } from '../src/game/data/skills.js'
import { PETS } from '../src/game/data/pets.js'
import { BLESSINGS } from '../src/game/data/progression.js'
import { TROPHY_MAP } from '../src/game/data/home.js'

// Every source of action speed must make actions really finish sooner, not only show a number
const copper = () => findAction('mining', 'copper_ore')
const time = () => G.actionTime('mining', copper())
// Swings finished in ten minutes of play (ores vary with lucky veins, swings only with speed)
function mined() {
  const before = state.stats.actions
  G.startSkill('mining', 'copper_ore')
  run(600, 0.25)
  G.stop()
  return state.stats.actions - before
}
function hero() {
  newHero()
  setLevel('mining', 1)
  state.gold = 1e9
}
afterEach(() => vi.restoreAllMocks())

describe('action speed bonuses', () => {
  const SOURCES = {
    'a pet that speeds mining': () => { state.pets.rock_golem = Date.now() },
    'a talent': () => { state.hero.xp = 1e9; state.hero.talents.diligent = 5 },
    'a rebirth upgrade': () => { state.ascension.upgrades.quickened = 5 },
    'a blessing': () => { setLevel('prayer', 99); expect(G.bless(BLESSINGS.find(b => b.id === 'diligence').id)).toBe(true) },
    'the tool shed': () => { state.rooms.tools = 5 },
    'a trophy': () => { state.trophies[TROPHY_MAP.warren_totem.id] = Date.now() },
    'a drink at the tavern': () => { state.tavern.drink = { id: 'ale', t: 600 } },
    'prestige': () => { state.prestige.mining = 3 },
    'agility': () => { setLevel('agility', 80) },
    'a better pickaxe': () => { state.tools.pickaxe = 'steel_pickaxe' },
    'a mythic pickaxe': () => { state.tools.pickaxe = 'worldheart_pickaxe' },
    'a dwarf': () => { state.race = 'dwarf' },
  }
  for (const [name, apply] of Object.entries(SOURCES)) {
    it(`${name} makes mining faster for real`, () => {
      hero()
      const before = time(), count = mined()
      hero()
      apply()
      const after = time()
      expect(after, 'action time').toBeLessThan(before)
      expect(mined(), 'swings in ten minutes').toBeGreaterThan(count)
    })
  }

  it('a bonus gained mid-action counts from the next tick', () => {
    hero()
    G.startSkill('mining', 'copper_ore')
    run(1)
    const slow = time()
    state.tavern.drink = { id: 'ale', t: 600 }
    run(0.25)
    expect(time()).toBeLessThan(slow)
  })
})

describe('action speed in every skill', () => {
  // A hero who can do the first action of a skill for ten minutes without running out
  function ready(skill) {
    newHero()
    state.gold = 1e9
    setLevel(skill, 99)
    const a = ACTIONS[skill].find(x => !x.festival && !x.tool) || ACTIONS[skill].find(x => !x.festival)
    if (a.tool) state.tools[a.tool.type] = Object.keys(ITEMS).find(id => ITEMS[id].toolType === a.tool.type && ITEMS[id].tier >= a.tool.tier)
    for (const k in a.in || {}) state.inventory[k] = 1e6
    return a
  }
  // Luck held still while counting, so a caught thief or a burnt dish counts the same both times
  function swings(skill, a) {
    const before = state.stats.actions
    G.startSkill(skill, a.id)
    expect(state.activity?.action, `${skill} starts`).toBe(a.id)
    const luck = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    run(600, 0.25)
    luck.mockRestore()
    G.stop()
    return state.stats.actions - before
  }
  const PET_FOR = Object.fromEntries(PETS.flatMap(p => Object.keys(p.mods || {}).filter(k => k.startsWith('speed.')).map(k => [k.slice(6), p.id])))
  for (const skill of Object.keys(ACTIONS)) {
    it(`${skill}: general, group and skill bonuses all speed it up`, () => {
      let a = ready(skill)
      const base = swings(skill, a)
      const bonuses = [
        ['ale', () => { state.tavern.drink = { id: 'ale', t: 9999 } }],
        ...(SKILLS[skill].cat === 'gathering' ? [['tool shed', () => { state.rooms.tools = 5 }]] : []),
        ...(SKILLS[skill].cat === 'artisan' ? [['workshop', () => { state.rooms.workshop = 5 }]] : []),
        ...(PET_FOR[skill] ? [['pet ' + PET_FOR[skill], () => { state.pets[PET_FOR[skill]] = Date.now() }]] : []),
      ]
      for (const [name, apply] of bonuses) {
        a = ready(skill)
        const t = G.actionTime(skill, a)
        apply()
        expect(G.actionTime(skill, a), `${skill} · ${name} · action time`).toBeLessThan(t)
        expect(swings(skill, a), `${skill} · ${name} · actions in ten minutes`).toBeGreaterThan(base)
      }
    })
  }
})

describe('other kinds of speed', () => {
  it('crops grow sooner with a growing talent', () => {
    newHero()
    const crop = CROPS[0], slow = G.growTime(crop)
    state.hero.talents.green = 5
    expect(G.growTime(crop)).toBeLessThan(slow)
  })

  it('the hero swings sooner with a speed talent and Dexterity', () => {
    newHero()
    const slow = G.attackSpeed()
    state.hero.talents.swift_blade = 5
    const talent = G.attackSpeed()
    expect(talent).toBeLessThan(slow)
    state.hero.attrs.dex = 40
    expect(G.attackSpeed()).toBeLessThan(talent)
  })
})

describe('the speed breakdown', () => {
  it('adds up to exactly the speed the game uses', () => {
    newHero()
    Object.assign(state.rooms, { tools: 3, workshop: 2 })
    state.pets.rock_golem = Date.now()
    state.hero.talents.diligent = 3
    state.ascension.upgrades.quickened = 2
    state.tavern.drink = { id: 'ale', t: 600 }
    state.trophies.warren_totem = Date.now()
    state.prestige.mining = 2
    setLevel('agility', 50)
    for (const skill of ['mining', 'smithing', 'fishing', 'agility']) {
      const parts = G.speedSources(skill)
      expect(1 + parts.reduce((v, x) => v + x.v, 0), skill).toBeCloseTo(G.speedFactor(skill), 9)
    }
    const ids = G.speedSources('mining').map(x => x.id)
    for (const id of ['rooms', 'pets', 'drink', 'home', 'prestige', 'agility', 'ascension', 'hero']) expect(ids).toContain(id)
  })
})
