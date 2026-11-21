import { describe, it, expect } from 'vitest'
import { G, state, newHero } from './helpers.js'
import { ambienceFor } from '../src/game/music.js'
import { fmt, setCompactNumbers } from '../src/game/format.js'

describe('music and ambience', () => {
  it('follow the weather and the time of day', () => {
    expect(ambienceFor('clear', false)).toHaveProperty('birds')
    expect(ambienceFor('clear', true)).toHaveProperty('crickets')
    expect(ambienceFor('storm', false)).toMatchObject({ rain: 1, thunder: 1 })
    expect(ambienceFor('nonsense', false)).toEqual({})
  })

  it('new settings reach old saves with their defaults', () => {
    newHero()
    G.loadSave({ ...JSON.parse(JSON.stringify(state)), settings: { sound: false } })
    expect(state.settings.sound).toBe(false)
    expect(state.settings.musicVol).toBe(45)
    expect(state.settings.muteHidden).toBe(true)
  })
})

describe('number format', () => {
  it('can show every digit instead of short forms', () => {
    expect(fmt(12500)).toBe('12.5K')
    setCompactNumbers(false)
    expect(fmt(12500)).toBe('12,500')
    setCompactNumbers(true)
  })
})
