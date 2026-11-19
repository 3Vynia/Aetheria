import { describe, it, expect } from 'vitest'
import { G, state, newHero, setLevel } from './helpers.js'
import { TROPHIES, TROPHY_MAP } from '../src/game/data/home.js'
import { ROOMS } from '../src/game/data/progression.js'
import { BOSSES, DUNGEONS } from '../src/game/data/combat.js'
import { ITEMS } from '../src/game/data/items.js'
import { modText } from '../src/i18n/mods.js'

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
