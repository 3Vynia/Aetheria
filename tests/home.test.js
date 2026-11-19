import { describe, it, expect } from 'vitest'
import { G, state, newHero, setLevel } from './helpers.js'
import { TROPHIES, TROPHY_MAP, PRODUCERS, HOME_STORE_HOURS } from '../src/game/data/home.js'
import { ROOMS } from '../src/game/data/progression.js'
import { BOSSES, DUNGEONS } from '../src/game/data/combat.js'
import { ITEMS, CROPS } from '../src/game/data/items.js'
import { modText } from '../src/i18n/mods.js'
import { vi } from 'vitest'

const bosses = new Set([...BOSSES.map(b => b.id), ...DUNGEONS.map(d => d.boss.id)])
const rooms = new Set(ROOMS.map(r => r.id))

// Everything a trophy needs except the kills
function readyFor(tr) {
  state.rooms[tr.room] = 1
  const { gold = 0, ...items } = tr.cost
  state.gold += gold
  for (const k in items) G.addItem(k, items[k])
}

describe('home trophies', () => {
  it('has one trophy per boss, each hung in a real room with real costs and bonuses', () => {
    expect(TROPHIES).toHaveLength(bosses.size)
    expect(new Set(TROPHIES.map(tr => tr.boss)).size).toBe(TROPHIES.length)
    for (const tr of TROPHIES) {
      expect(bosses.has(tr.boss)).toBe(true)
      expect(rooms.has(tr.room)).toBe(true)
      for (const k in tr.cost) if (k !== 'gold') expect(ITEMS[k], k).toBeTruthy()
      for (const [k, v] of Object.entries(tr.mods)) expect(modText(k, v)).not.toMatch(/mods\./)
      expect(tr.name).not.toMatch(/^trophies\./)
      expect(tr.desc).not.toMatch(/^trophies\./)
    }
  })

  it('asks for the kills, then the room, then the price', () => {
    newHero()
    const tr = TROPHY_MAP.goblin_crown
    expect(G.trophyBlocker(tr)).toBe('kills')
    expect(G.hangTrophy(tr.id)).toBe(false)
    state.killsBy[tr.boss] = tr.kills
    expect(G.trophyBlocker(tr)).toBe('room')
    state.rooms[tr.room] = 1
    expect(G.trophyBlocker(tr)).toBe('cost')
    readyFor(tr)
    expect(G.trophyBlocker(tr)).toBe(null)
  })

  it('takes its price once and gives its bonus', () => {
    newHero()
    const tr = TROPHY_MAP.goblin_crown
    state.killsBy[tr.boss] = tr.kills
    readyFor(tr)
    const gold = G.mod('gold'), coins = state.gold
    expect(G.hangTrophy(tr.id)).toBe(true)
    expect(state.gold).toBe(coins - tr.cost.gold)
    expect(G.qty('uncut_sapphire')).toBe(0)
    expect(G.mod('gold')).toBeCloseTo(gold + tr.mods.gold)
    expect(G.trophiesHung()).toBe(1)
    // Only once
    readyFor(tr)
    expect(G.hangTrophy(tr.id)).toBe(false)
  })

  it('keeps hung trophies through an ascension', () => {
    newHero()
    const tr = TROPHY_MAP.warren_totem
    state.killsBy[tr.boss] = tr.kills
    readyFor(tr)
    expect(G.hangTrophy(tr.id)).toBe(true)
    for (const s of ['attack', 'strength', 'defense', 'mining', 'woodcutting', 'fishing']) setLevel(s, 99)
    expect(G.ascend()).toBeGreaterThan(0)
    expect(G.hasTrophy(tr.id)).toBe(true)
    expect(G.mod('speed.gathering')).toBeGreaterThanOrEqual(tr.mods['speed.gathering'])
  })
})

describe('rooms that work on their own', () => {
  const HOUR = 3600e3
  // Moves the clock forward by some hours
  const later = h => vi.spyOn(Date, 'now').mockReturnValue(start + h * HOUR)
  let start

  it('only works once the room is built', () => {
    newHero()
    G.ensureHomeWork()
    for (const p of PRODUCERS) expect(G.homeStored(p.room)).toBe(null)
  })

  it('piles up work over time, up to the store, and pays it out', () => {
    newHero()
    setLevel('farming', 20)
    start = Date.now()
    state.gold = 1e9
    for (const id of ['garden', 'vault']) { state.rooms[id] = 2; G.ensureHomeWork() }
    later(3)
    const crop = G.homeStored('garden')
    const best = CROPS.filter(c => c.lvl <= 20).sort((a, b) => b.value - a.value)[0]
    expect(crop.item).toBe(best.id)
    expect(crop.qty).toBe(3 * crop.perHour)
    expect(crop.full).toBe(false)
    const before = G.qty(best.id)
    expect(G.collectHome('garden').qty).toBe(crop.qty)
    expect(G.qty(best.id)).toBe(before + crop.qty)
    expect(G.homeStored('garden').qty).toBe(0)
    // The store caps at its limit
    later(3 + HOME_STORE_HOURS * 3)
    const gold = state.gold, vault = G.homeStored('vault')
    expect(vault.full).toBe(true)
    expect(vault.qty).toBe(Math.floor(vault.perHour * HOME_STORE_HOURS))
    expect(G.collectAllHome()).toHaveLength(2)
    expect(state.gold).toBe(gold + vault.qty)
    vi.restoreAllMocks()
  })

  it('studies for the weakest skill and cooks the best dish known', () => {
    newHero()
    start = Date.now()
    for (const s of Object.keys(state.skills)) setLevel(s, 30)
    setLevel('agility', 10)
    setLevel('cooking', 30)
    state.rooms.library = 1
    state.rooms.kitchen = 1
    G.ensureHomeWork()
    later(5)
    const notes = G.homeStored('library')
    expect(notes.skill).toBe('agility')
    expect(notes.qty).toBeGreaterThan(0)
    const xp = state.skills.agility.xp
    G.collectHome('library')
    expect(state.skills.agility.xp).toBe(xp + notes.qty)
    const dish = G.homeStored('kitchen')
    expect(ITEMS[dish.item].heal).toBeGreaterThan(0)
    vi.restoreAllMocks()
  })
})

describe('companions living at home', () => {
  // A hero with a squire and an archer hired, and nobody in the party
  function company() {
    newHero()
    state.gold = 1e9
    G.hireMerc('squire')
    G.hireMerc('archer')
    state.company.party = []
    return state.company.members
  }

  it('beds them by bedroom level, and never the ones with the hero', () => {
    const [a, b] = company()
    expect(G.homeGuests()).toHaveLength(0)
    expect(G.companionPlace(a)).toBe('nobed')
    state.rooms.bedroom = 1
    expect(G.homeGuests()).toHaveLength(2)
    state.company.party = [a.id]
    expect(G.companionPlace(a)).toBe('party')
    expect(G.companionPlace(b)).toBe('home')
  })

  it('gains trust, trains and heals while at home', () => {
    const [a] = company()
    Object.assign(state.rooms, { bedroom: 1, kitchen: 3, armory: 5 })
    a.hurtUntil = Date.now() + 60e3
    const lvl = a.lvl
    G.updateHome(30 * 3600)
    expect(a.trust).toBe(Math.floor(G.homeRates().trust * 30))
    expect(a.lvl).toBeGreaterThan(lvl)
    expect(G.mercHurt(a)).toBe(false)
  })

  it('does nothing for those without a bed', () => {
    const [a] = company()
    G.updateHome(10 * 3600)
    expect(a.trust || 0).toBe(0)
  })
})
