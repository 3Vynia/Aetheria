import { describe, it, expect } from 'vitest'
import { G, state, newHero, setLevel } from './helpers.js'
import { PRESTIGE } from '../src/game/data/progression.js'

describe('prestige', () => {
  it('resets the level for a lasting bonus, up to the cap', () => {
    newHero()
    expect(G.canPrestige('mining')).toBe(false)
    setLevel('mining', 99)
    const speed = G.speedFactor('mining')
    expect(G.doPrestige('mining')).toBe(true)
    expect(G.level('mining')).toBe(1)
    expect(G.prestigeOf('mining')).toBe(1)
    expect(G.speedFactor('mining')).toBeGreaterThan(speed - 0.01)
    // At the cap the skill stays at the top and offers no more
    state.prestige.mining = PRESTIGE.max
    setLevel('mining', 99)
    expect(G.prestigeMaxed('mining')).toBe(true)
    expect(G.canPrestige('mining')).toBe(false)
    expect(G.doPrestige('mining')).toBe(false)
    expect(G.level('mining')).toBe(99)
  })
})
