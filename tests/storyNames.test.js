import { describe, it, expect } from 'vitest'
import { G, state, newHero } from './helpers.js'
import { t, setLocale } from '../src/i18n/index.js'
import { NAMED } from '../src/game/data/journal.js'

const king = () => t('journal.people.edmund.name')
const archmage = () => t('quests.arcane_studies.giver')

describe('the names of the king and the archmage', () => {
  it('are rolled for every new game, as a man and a woman', () => {
    expect(NAMED.edmund).toBe('he')
    expect(NAMED.selene).toBe('she')
    newHero()
    const { edmund, selene } = state.journal.names
    expect(edmund).not.toBe('Edmund')
    expect(selene).not.toBe('Selene')
    expect(king()).toContain(edmund)
    expect(king()).not.toContain('Edmund')
    expect(archmage()).toContain(selene)
    expect(G.journalNames().edmund).toBe(edmund)
  })

  it('stay the ones an older game already knew', () => {
    newHero()
    const old = JSON.parse(JSON.stringify(state))
    delete old.journal.names.edmund
    delete old.journal.names.selene
    G.loadSave(old)
    expect(state.journal.names.edmund).toBe('Edmund')
    expect(state.journal.names.selene).toBe('Selene')
    expect(king()).toContain('Edmund')
  })

  it('follow the game that is loaded and the language chosen', async () => {
    newHero()
    const first = state.journal.names.edmund
    const save = JSON.parse(JSON.stringify(state))
    newHero()
    state.journal.names.edmund = first === 'Aldo' ? 'Brand' : 'Aldo'
    G.ensureJournal()
    expect(king()).toContain(state.journal.names.edmund)
    G.loadSave(save)
    expect(king()).toContain(first)
    await setLocale('es')
    expect(king()).toContain(first)
    expect(king()).not.toContain('Edmund')
    await setLocale('en')
    expect(king()).toContain(first)
  })
})
