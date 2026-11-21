import { describe, it, expect, beforeEach } from 'vitest'
import { G, state, newHero } from './helpers.js'
import { seal, open, isSealed } from '../src/game/vault.js'
import { reviewSave, GAME_BIRTH } from '../src/game/plausibility.js'
import { encodeCode, decodeAny, importErrorKey } from '../src/game/transfer.js'

const HOUR = 3600e3
// A save as a chatbot would write it: everything at the top, after a believable-sounding time
const inflated = () => {
  const s = JSON.parse(JSON.stringify(state))
  for (const k in s.skills) s.skills[k].xp = 13_034_431
  s.gold = 9e11
  s.hero.xp = 5e9
  s.stats.playTime = 3600 * 5
  return s
}

describe('sealed saves', () => {
  beforeEach(() => newHero({ name: 'Sella' }))

  it('are kept sealed in the browser and open again unchanged', () => {
    state.gold = 777
    G.save()
    const raw = localStorage.getItem('aetheria-slot-0')
    expect(isSealed(raw)).toBe(true)
    expect(raw).not.toContain('Sella')
    expect(open(raw).gold).toBe(777)
  })

  it('refuse to open if a single character was changed', () => {
    const code = seal({ gold: 10 })
    const i = code.length - 5
    const bad = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1)
    expect(() => open(bad)).toThrow('tampered')
  })

  it('travel sealed in files and codes, and a changed code is refused with its own message', async () => {
    const code = await encodeCode(JSON.parse(JSON.stringify(state)))
    expect(code).not.toContain('Sella')
    expect((await decodeAny(code)).name).toBe('Sella')
    const bad = code.slice(0, 30) + (code[30] === 'x' ? 'y' : 'x') + code.slice(31)
    const err = await decodeAny(bad).catch(e => e)
    expect(importErrorKey(err)).toBe('integrity.tampered')
  })

  it('refuse a sealed slot that was changed by hand, without touching it', () => {
    G.save()
    const raw = localStorage.getItem('aetheria-slot-0')
    const bad = raw.slice(0, 50) + (raw[50] === 'x' ? 'y' : 'x') + raw.slice(51)
    localStorage.setItem('aetheria-slot-0', bad)
    expect(G.loadSlot(0)).toBe(false)
    expect(localStorage.getItem('aetheria-slot-0')).toBe(bad)
  })

  it("seal the players' own plain saves from an older version as they are, never judging them", () => {
    localStorage.clear()
    const honest = JSON.parse(JSON.stringify(state))
    honest.gold = 4321
    localStorage.setItem('aetheria-slot-1', JSON.stringify(honest))
    expect(G.listSlots()[1].gold).toBe(4321)
    const sealed = localStorage.getItem('aetheria-slot-1')
    expect(isSealed(sealed)).toBe(true)
    expect(open(sealed)).toMatchObject({ gold: 4321, integrity: { status: 'sealed' } })
    expect(G.loadSlot(1)).toBe(true)
    expect(state.gold).toBe(4321)
  })

  it('keep the mark through a rebirth', () => {
    state.integrity = { status: 'altered', reasons: ['gold'] }
    for (const k of Object.keys(state.skills)) state.skills[k].xp = 2e7
    expect(G.canAscend()).toBe(true)
    G.ascend()
    expect(state.integrity.status).toBe('altered')
  })
})

describe('plain imports', () => {
  beforeEach(() => newHero())

  it('mark a save made up by a chatbot as altered, for good', async () => {
    const s = await decodeAny(JSON.stringify(inflated()))
    expect(s.integrity.status).toBe('altered')
    expect(s.integrity.reasons).toEqual(expect.arrayContaining(['xpRate', 'gold', 'heroXp']))
    // Taking the mark off in the file does not help: it is the review that decides
    const again = inflated()
    again.integrity = { status: 'creator' }
    expect((await decodeAny(JSON.stringify(again))).integrity.status).toBe('altered')
  })

  it('still take in an honest old .json file, with no mark', async () => {
    const s = JSON.parse(JSON.stringify(state))
    s.created = Date.now() - 30 * HOUR
    s.stats.playTime = 20 * 3600
    const file = JSON.stringify({ game: 'aetheria', format: 1, save: s })
    expect((await decodeAny(file)).integrity.status).toBe('reviewed')
  })
})

describe('the review', () => {
  beforeEach(() => newHero())

  it('lets an honest game through', () => {
    const s = JSON.parse(JSON.stringify(state))
    s.created = Date.now() - 40 * HOUR
    s.stats.playTime = 30 * 3600
    s.skills.mining.xp = 2_000_000
    s.hero.xp = 600_000
    s.gold = 50_000
    s.stats.goldEarned = 80_000
    expect(reviewSave(s)).toEqual({ ok: true, reasons: [] })
  })

  it('catches what no honest game can have', () => {
    const s = JSON.parse(JSON.stringify(state))
    s.created = GAME_BIRTH - 1
    expect(reviewSave(s).reasons).toContain('created')
    s.created = Date.now() - HOUR
    s.stats.playTime = 100 * 3600
    expect(reviewSave(s).reasons).toContain('playTime')
    s.inventory.copper_ore = 1e12
    expect(reviewSave(s).reasons).toContain('itemCount')
  })
})

describe('creator saves', () => {
  beforeEach(() => newHero({ name: 'Creadora' }))

  it('open only with a genuine signature, whatever their numbers', async () => {
    const { execFileSync } = await import('node:child_process')
    const fs = await import('node:fs')
    const os = await import('node:os')
    const keyFile = os.homedir() + '/.config/aetheria/creator.key'
    if (!fs.existsSync(keyFile)) return
    const dir = fs.mkdtempSync(os.tmpdir() + '/creator-')
    fs.writeFileSync(dir + '/s.json', JSON.stringify(inflated()))
    execFileSync('node', ['scripts/creator.mjs', 'sign', dir + '/s.json', dir + '/s.aetheria'])
    const code = fs.readFileSync(dir + '/s.aetheria', 'utf8')
    const s = await decodeAny(code)
    expect(s.integrity.status).toBe('creator')
    expect(s.gold).toBe(9e11)
    // The mark stays inside the seal through saving and loading
    G.loadSave(s)
    expect(G.loadSlot(G.slot)).toBe(true)
    expect(state.integrity.status).toBe('creator')
    // One changed letter in the body and the signature no longer holds
    const i = 40
    const bad = code.slice(0, i) + (code[i] === 'a' ? 'b' : 'a') + code.slice(i + 1)
    expect(importErrorKey(await decodeAny(bad).catch(e => e))).toBe('integrity.tampered')
  })
})

describe('saves from every earlier version', () => {
  const fixtures = new URL('./fixtures/saves/', import.meta.url)
  const files = async () => {
    const fs = await import('node:fs')
    return fs.readdirSync(fixtures).filter(f => f.endsWith('.json')).map(f => [f, fs.readFileSync(new URL(f, fixtures), 'utf8')])
  }

  it('are sealed in the browser without losing anything', async () => {
    for (const [f, text] of await files()) {
      localStorage.clear()
      const data = JSON.parse(text)
      const save = data.game === 'aetheria' ? data.save : data
      localStorage.setItem('aetheria-slot-0', JSON.stringify(save))
      expect(G.listSlots()[0], f).not.toBe(null)
      expect(isSealed(localStorage.getItem('aetheria-slot-0')), f).toBe(true)
      expect(G.loadSlot(0), f).toBe(true)
      expect(state.name, f).toBe(save.name)
      expect(state.integrity.status, f).toBe('sealed')
    }
  })

  it('import as files with no mark', async () => {
    for (const [f, text] of await files()) expect((await decodeAny(text)).integrity, f).toMatchObject({ status: 'reviewed' })
  })
})
