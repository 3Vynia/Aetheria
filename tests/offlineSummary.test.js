import { describe, it, expect, afterEach, vi } from 'vitest'
import { G, state, newHero, setLevel } from './helpers.js'
import { summarise } from '../src/ui/moments.js'

describe('welcome-back summary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps what happened while away, and the levels it started from', () => {
    newHero()
    setLevel('woodcutting', 10)
    G.startSkill('woodcutting', 'logs')
    const shown = vi.fn()
    const off = G.on('levelup', shown)
    const sum = G.simulate(4 * 3600)
    off()
    expect(shown).not.toHaveBeenCalled()
    expect(sum.from.skills.woodcutting).toBe(10)
    expect(sum.levels.woodcutting).toBeGreaterThan(10)
    expect(sum.moments.some(m => m.evt === 'mastery')).toBe(true)
    expect(state.skills.woodcutting.xp).toBeGreaterThan(0)
  })

  it('folds repeats, keeps the last step of a climb and puts the rarest first', () => {
    const { list, deaths } = summarise([
      { evt: 'mastery', data: { name: 'Tree', level: 20 } },
      { evt: 'rare', data: { item: 'oak_logs' } },
      { evt: 'death', data: null },
      { evt: 'mastery', data: { name: 'Tree', level: 30 } },
      { evt: 'rare', data: { item: 'oak_logs' } },
      { evt: 'achievement', data: { id: 'a', icon: 'trophy', name: 'One', gold: 10 } },
      { evt: 'achievement', data: { id: 'b', icon: 'trophy', name: 'Two', gold: 5 } },
      { evt: 'nonsense', data: {} },
    ])
    expect(deaths).toBe(1)
    expect(list[0]).toMatchObject({ evt: 'rare', n: 2 })
    const mastery = list.filter(m => m.evt === 'mastery')
    expect(mastery).toHaveLength(1)
    expect(mastery[0].text).toContain('30')
    const ach = list.filter(m => m.evt === 'achievement')
    expect(ach).toHaveLength(1)
    expect(ach[0].text).toContain('One')
    expect(ach[0].text).toContain('Two')
  })
})
