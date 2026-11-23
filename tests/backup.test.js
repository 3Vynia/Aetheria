import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { G, state, newHero } from './helpers.js'
import { listBackups, writeBackup, readBackup, deleteBackups, BACKUP_EVERY, BEFORE } from '../src/game/backup.js'
import { decodeAny, isSave } from '../src/game/transfer.js'
import { readFileSync, readdirSync } from 'node:fs'

const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3
const tiers = async slot => Object.fromEntries((await listBackups(slot)).map(b => [b.tier, b]))
const copy = (n, at) => [JSON.stringify({ n }), { name: `copy ${n}` }, at]

// A browser with IndexedDB; every test works on slots of its own, so they do not see each other's copies
beforeAll(() => { globalThis.indexedDB = new IDBFactory() })
afterAll(() => { delete globalThis.indexedDB })

describe('automatic backups', () => {
  it('fills the three tiers with copies from different moments', async () => {
    const t0 = Date.now()
    await writeBackup(10, ...copy(1, t0))
    expect(Object.keys(await tiers(10))).toEqual(['recent'])
    await writeBackup(10, ...copy(2, t0 + 5 * MIN))
    await writeBackup(10, ...copy(3, t0 + 10 * MIN))
    const b = await tiers(10)
    expect(JSON.parse(b.recent.data).n).toBe(3)
    expect(JSON.parse(b.hour.data).n).toBe(2)
    expect(JSON.parse(b.day.data).n).toBe(1)
    // Each copy keeps the time it was taken, not the time it moved
    expect(b.day.at).toBe(t0)
    // A plain copy (from before sealing) is the player's own: it opens as it is
    expect(await readBackup(10, 'hour')).toMatchObject({ n: 2, integrity: { status: 'sealed' } })
  })

  it('never keeps the same copy twice and keeps each tier about its age, over days of play', async () => {
    const t0 = Date.now()
    let n = 0
    for (let now = t0; now < t0 + 3 * DAY; now += BACKUP_EVERY) {
      await writeBackup(11, ...copy(++n, now))
      const b = await tiers(11)
      if (n < 3) continue
      const ns = ['recent', 'hour', 'day'].map(k => JSON.parse(b[k].data).n)
      expect(new Set(ns).size, `step ${n}`).toBe(3)
      expect(b.recent.at).toBe(now)
      expect(now - b.hour.at).toBeLessThanOrEqual(HOUR + 2 * BACKUP_EVERY)
      expect(now - b.day.at).toBeLessThanOrEqual(DAY + HOUR + 2 * BACKUP_EVERY)
      expect(b.day.at).toBeLessThan(b.hour.at)
    }
    // After a day the day copy is really old, not a copy of a few minutes ago
    const b = await tiers(11)
    expect(t0 + 3 * DAY - b.day.at).toBeGreaterThan(HOUR)
  })

  it('keeps the slots apart and deletes them with every copy', async () => {
    await writeBackup(12, ...copy(1, Date.now()))
    await writeBackup(13, ...copy(2, Date.now()))
    expect((await listBackups(12)).map(b => JSON.parse(b.data).n)).toEqual([1])
    await deleteBackups(12)
    expect(await listBackups(12)).toEqual([])
    expect(await listBackups(13)).toHaveLength(1)
  })

  it('go with a game the player deletes, since deleting is asked for with a typed code', async () => {
    newHero({ name: 'Gone' })
    G.slot = 14
    G.save()
    await G.backupNow()
    expect(await listBackups(14)).toHaveLength(1)
    G.deleteSlot(14)
    await new Promise(r => setTimeout(r, 50))
    expect(await listBackups(14)).toEqual([])
  })
})

describe('the copy from before a replacement', () => {
  it('keeps the game an import replaces, and the rotation leaves it alone', async () => {
    newHero({ name: 'Old' })
    G.slot = 14
    G.save()
    await G.backupNow()
    await G.keepBefore(14)
    G.loadSave({ ...JSON.parse(JSON.stringify(state)), name: 'New' })
    expect(state.name).toBe('New')
    for (let i = 1; i <= 4; i++) await writeBackup(14, JSON.stringify({ ...state }), G.summarize(state), Date.now() + i * HOUR)
    const b = await tiers(14)
    expect(b[BEFORE].info.name).toBe('Old')
    expect((await readBackup(14, BEFORE)).name).toBe('Old')
  })

  it('undoes a replacement by swapping with the game that replaced it', async () => {
    newHero({ name: 'Ann' })
    G.slot = 15
    G.save()
    await G.keepBefore(15)
    G.loadSave({ ...JSON.parse(JSON.stringify(state)), name: 'Bea' })
    // Restore the copy from before, the way the settings screen does: read it, keep the current game, load it
    const back = await readBackup(15, BEFORE)
    G.save()
    await G.keepBefore(15)
    G.loadSave(back)
    expect(state.name).toBe('Ann')
    expect((await readBackup(15, BEFORE)).name).toBe('Bea')
  })

  it('does nothing for an empty slot, and keeps even a save it cannot read, so nothing is lost', async () => {
    expect(await G.keepBefore(16)).toBe(null)
    expect(await listBackups(16)).toEqual([])
    localStorage.setItem('aetheria-slot-16', '{broken')
    await G.keepBefore(16)
    expect((await listBackups(16)).map(b => b.tier)).toEqual(['before'])
  })
})

describe('importing a save', () => {
  const fixtures = new URL('./fixtures/saves/', import.meta.url)

  it('accepts the saves of every version so far', () => {
    for (const f of readdirSync(fixtures)) {
      const data = JSON.parse(readFileSync(new URL(f, fixtures), 'utf8'))
      expect(isSave(data.game === 'aetheria' ? data.save : data), f).toBe(true)
    }
    newHero()
    expect(isSave(JSON.parse(JSON.stringify(state)))).toBe(true)
  })

  it('refuses files that are not a save or are broken', async () => {
    newHero()
    const good = JSON.parse(JSON.stringify(state))
    const broken = [
      null, [], 'text', {},
      { ...good, name: '' },
      { ...good, name: 42 },
      { ...good, skills: {} },
      { ...good, skills: [] },
      { ...good, skills: { ...good.skills, mining: { xp: -5 } } },
      { ...good, skills: { ...good.skills, mining: { xp: 'lots' } } },
      { ...good, skills: { ...good.skills, mining: null } },
      { ...good, gold: -1 },
      { ...good, gold: '100' },
      { ...good, inventory: [] },
      { ...good, hero: 'x' },
      { ...good, lastTick: 'yesterday' },
    ]
    for (const s of broken) {
      expect(isSave(s), JSON.stringify(s)?.slice(0, 60)).toBe(false)
      await expect(decodeAny(JSON.stringify(s ?? 'null'))).rejects.toThrow()
    }
    await expect(decodeAny(JSON.stringify({ game: 'aetheria', format: 1, save: { ...good, gold: -1 } }))).rejects.toThrow()
  })
})
