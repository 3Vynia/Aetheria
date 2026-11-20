/* =========================================================
   COMBAT — fights, regions, dungeons, bosses and the endless tower.
   Mixed into G (engine.js); `this` is the engine.
   ========================================================= */
import { ITEMS } from './data/items.js'
import { COMBAT_STYLES, SPELLS, MONSTERS, AREAS, BOSSES, TOWER_SHOP, towerMonster, DUNGEONS } from './data/combat.js'
import { ECHOES } from './data/echoes.js'



import { THREAT_EFFECT } from './data/realm.js'



import { TOWER_AFFIXES, AFFIX_TOKENS, affixOf, guardianOf, guardianReward, rivalBest } from './data/tower.js'
import { guildRoster } from './data/guilds.js'
import { t } from '../i18n/index.js'
import { TRAITS, ELITE_LOOT, ENERGY, CREATURE_BUFFS } from './data/fighting.js'
import { cloneNamed, named } from '../i18n/bind.js'

const RESPAWN_TIME = 1.5
const REGION_GOLD = THREAT_EFFECT.gold, REGION_LOOT = THREAT_EFFECT.loot
const BOSS_MAP = Object.fromEntries([...BOSSES, ...ECHOES].map(b => [b.id, b]))
let towerCache = { key: '', m: null }
const scaledCache = new Map()
const msg = (key, params = {}) => ({ key, params })
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1))

export const combat = {
  /* ================= combat ================= */
  // The stance in use (an unknown one falls back to Accurate) and the kind of fight it belongs to
  stance() { return COMBAT_STYLES[this.s.combatStyle] || COMBAT_STYLES.attack },
  styleType() { return this.stance().type },
  currentSpell() { return SPELLS.find(sp => sp.id === this.s.spell) || SPELLS[0] },
  // A staff channels the air: with one in hand, spells need no air runes
  staffInHand() { return ITEMS[this.s.equipment.weapon]?.style === 'magic' },
  spellRunes(sp = this.currentSpell()) {
    if (!this.staffInHand() || !sp.runes.air_rune) return sp.runes
    const { air_rune, ...rest } = sp.runes
    return rest
  },
  onTask(m) { return this.s.slayer.task && m && this.s.slayer.task.monster === m.id },
  areaUnlocked(area) { return !area.reqQuest || this.questDone(area.reqQuest) },
  // Apply the difficulty multiplier to a monster's stats
  scaleMonster(m) {
    const f = this.monsterMult() * (1 + Math.round(this.regionEffect(m, 'monster') * 50) / 50)
    if (f === 1) return m
    const key = m.id + '|' + f + '|' + (m.affix || '')
    let s = scaledCache.get(key)
    if (!s) {
      s = cloneNamed(m, { hp: Math.round(m.hp * f), att: Math.round(m.att * f), def: Math.round(m.def * f), maxHit: Math.max(1, Math.round(m.maxHit * f)) })
      scaledCache.set(key, s)
    }
    return s
  },

  // A kill can change the hunting streak and a shot the ammo, so both are part of the key
  playerStats(m) { return this.memo(`ps|${m.id}|${this.s.hunt?.streak}|${this.s.equipment.ammo}`, this.playerStatsNow, m) },
  playerStatsNow(m) {
    const st = this.stance(), type = st.type, b = this.bonuses()
    let acc, maxHit
    if (type === 'melee') {
      const effAtt = this.boosted('attack') + 8 + st.acc
      const effStr = this.boosted('strength') + 8 + st.str
      acc = effAtt * (b.atk + 64)
      maxHit = Math.floor(0.5 + effStr * (b.str + 64) / 640)
    } else if (type === 'ranged') {
      const eff = this.boosted('ranged') + 8
      acc = (eff + st.acc) * (b.rAtk + 64)
      maxHit = Math.floor(0.5 + (eff + st.str) * (b.rStr + 64) / 640)
    } else {
      const eff = this.boosted('magic') + 8 + st.acc
      acc = eff * (b.mAtk + 64)
      maxHit = Math.floor(this.currentSpell().max * (1 + b.mDmg))
    }
    let accMult = 1 + (this.blessed('vigor') ? 0.1 : 0) + this.mod(type + 'Acc')
    let dmgMult = (1 + (this.blessed('vigor') ? 0.1 : 0) + this.room('trophy') * 0.04 + this.mod(type + 'Dmg') + this.homeEffect(m, 'dmg')) * st.dmg
    const helm = this.taskHelmBonus()
    if (helm && this.onTask(m)) { accMult += helm; dmgMult += helm }
    const hunt = this.huntBonus(m)
    accMult += hunt
    dmgMult += hunt
    const effDef = this.boosted('defense') + 8 + st.def
    return {
      accRoll: acc * accMult,
      maxHit: Math.max(1, Math.floor(maxHit * dmgMult * this.weapon().dmg)),
      defRoll: effDef * (b.def + 64) * (1 + this.room('armory') * 0.05 + (this.blessed('protection') ? 0.1 : 0) + this.mod('defense')) * st.guard,
    }
  },
  monsterRolls(m) {
    return { accRoll: (m.att + 9) * 64, defRoll: (m.def + 9) * 64 * (m.weak === this.styleType() ? 0.65 : 1) }
  },
  hitChance(acc, def) { return acc > def ? 1 - (def + 2) / (2 * (acc + 1)) : acc / (2 * (def + 1)) },

  // Returns a { key, params } message if the current style cannot attack, or null
  attackBlocker() {
    const type = this.styleType()
    if (this.underTrial('arcane') && type !== 'magic') return msg('trials.onlyMagic')
    if (type === 'ranged') {
      const w = this.s.equipment.weapon
      if (!w || ITEMS[w].style !== 'ranged') return msg('msg.needBow')
      const ammo = this.s.equipment.ammo
      if (!ammo || this.qty(ammo) <= 0) return msg('msg.noArrows')
    }
    if (type === 'magic') {
      const sp = this.currentSpell()
      if (this.level('magic') < sp.lvl) return msg('msg.spellLevel', { lvl: sp.lvl, spell: sp.name })
      if (!this.hasItems(this.spellRunes(sp))) return msg('msg.noRunes', { spell: sp.name })
    }
    return null
  },

  getMonster(act) {
    if (!act) return null
    if (act.kind === 'boss') return BOSS_MAP[act.target] && this.memo('boss|' + act.target, this.scaleMonster, BOSS_MAP[act.target])
    if (act.kind === 'dungeon') {
      const dg = DUNGEONS.find(d => d.id === act.target)
      if (!dg) return null
      return this.memo(`dg|${act.target}|${act.room}`, this.scaleMonster, act.room < dg.rooms.length ? MONSTERS[dg.rooms[act.room]] : dg.boss)
    }
    if (act.kind === 'tower') {
      const key = act.floor + '|' + this.monsterMult() + '|' + affixOf(act.floor)
      if (towerCache.key !== key) towerCache = { key, m: this.scaleMonster(this.towerFloor(act.floor)) }
      return towerCache.m
    }
    if (act.kind === 'omen') return this.omenCreature(act.target)
    if (act.kind === 'weekly') return this.weeklyMonster(act)
    if (act.kind === 'festival') return this.festivalCreature()
    const m = MONSTERS[act.target] && this.memo('mon|' + act.target, this.scaleMonster, MONSTERS[act.target])
    return m && act.elite ? this.eliteMonster(m, act.elite) : m
  },

  startCombat(kind, target, opts = {}) {
    const cur = this.s.activity
    if (cur && cur.type === 'combat' && cur.kind === kind && cur.target === target && kind !== 'tower') return this.stop()
    const blocker = this.attackBlocker()
    if (blocker) return this.toast('crossed-swords', blocker.key, blocker.params, 'warn')
    if (kind === 'boss') {
      const b = BOSS_MAP[target]
      if (b.reqQuest && !this.questDone(b.reqQuest)) return this.toast('padlock', 'msg.bossLocked', {}, 'warn')
      if (b.echo && !this.echoesOpen()) return this.toast('padlock', 'echoes.locked', {}, 'warn')
    }
    if (kind === 'area') {
      const m = MONSTERS[target]
      const area = AREAS.find(a => a.id === m.area)
      if (!this.areaUnlocked(area)) return this.toast('padlock', 'msg.areaLocked', {}, 'warn')
      if (m.slayer && this.level('slayer') < m.slayer) return this.toast('death-skull', 'msg.needLevel', { lvl: m.slayer, skill: '@skill:slayer' }, 'warn')
    }
    if (kind === 'omen' && !(this.canHunt() && this.activeOmen().hunt === target)) return this.toast('crystal-ball', 'omens.gone', {}, 'warn')
    if (kind === 'festival' && !this.canFightWraith()) return this.toast('ice-spell-cast', 'festival.closed', {}, 'warn')
    if (kind === 'weekly' && !this.canWeekly()) return this.toast('crowned-skull', this.weeklyUnlocked() ? 'weekly.alreadySlain' : 'weekly.locked', {}, 'warn')
    if (kind === 'dungeon') {
      const dg = DUNGEONS.find(d => d.id === target)
      if (!dg) return
      if (dg.reqQuest && !this.questDone(dg.reqQuest)) return this.toast('padlock', 'msg.dungeonLocked', {}, 'warn')
    }
    const floor = kind === 'tower' ? Math.max(1, Math.floor(this.s.tower.best / 10) * 10 + 1) : null
    if (this.s.hp <= 0) this.s.hp = 1
    const act = { type: 'combat', kind, target, floor, room: 0, mHp: 0, pTimer: 0, mTimer: 0, mercTimer: 0, respawn: 0, party: [], runKills: 0, clears: 0, elite: null, fx: null, energy: 0, cd: {}, hb: {}, phase: 0 }
    this.startTracking(act)
    // The company comes to every fight but the endless ones in a region, paid once when it starts
    if (kind !== 'area') this.bringParty(act)
    this.spawn(act)
    if (kind === 'weekly') this.beginWeeklyAttempt(act)
    this.s.activity = act
    this.emit('activity')
  },

  updateCombat(dt) {
    const act = this.s.activity
    const m = this.getMonster(act)
    if (!m) return this.stop()
    if (act.respawn > 0) {
      act.respawn -= dt
      if (act.respawn <= 0) this.spawn(act)
      return
    }
    // The weekly boss runs its own mechanics first (they can end the attempt)
    if (act.kind === 'weekly' && this.weeklyTick(act, dt, m)) return
    // Statuses tick first: bleeding, poison or burns can finish a fight on their own
    if (act.live) act.live.t += dt
    const fell = this.tickStatuses(act, dt)
    this.tickAbilities(act, dt)
    if (fell === 'monster') return this.killMonster(m)
    if (fell === 'player') return this.die(m)
    if (this.shouldRetreat(act)) return this.retreat(m)
    const moved = this.bossMechTick(act, m, dt)
    if (moved === 'player') return this.die(m)
    if (moved === 'fled') return this.monsterFled(m)
    if (this.shouldRetreat(act)) return this.retreat(m)
    const ps = this.playerStats(m)
    const mr = this.monsterRolls(m)
    // A move just started: the hero may answer it at once
    if (act.mech?.charge && !act.mech.charge.reacted) {
      const r = this.reactToCharge(act, m, ps, mr)
      if (r === 'end') return
      if (r === 'kill') return this.killMonster(m)
    }
    const regen = this.regenPerSec(m, act)
    if (regen) act.mHp = Math.min(m.hp, act.mHp + regen * dt)

    // The hero swings at the weapon's pace; a stun stops the clock and a slow stretches it
    if (!this.hasStatus(act, 'player', 'stun')) act.pTimer += (act.kind === 'weekly' ? dt * this.weeklyPace(act) : dt) / (1 + this.slowOf(act, 'player'))
    const speed = this.attackSpeed()
    if (act.pTimer >= speed) {
      act.pTimer -= speed
      const blocker = this.attackBlocker()
      if (blocker) return this.stop(blocker)
      const type = this.styleType()
      if (type === 'ranged' && Math.random() >= this.mod('ammoSave')) this.removeItem(this.s.equipment.ammo, 1)
      if (type === 'magic' && Math.random() >= this.mod('runeSave')) Object.entries(this.spellRunes()).forEach(([r, q]) => this.removeItem(r, q))
      const r = this.heroTurn(act, m, ps, mr)
      if (r === 'end') return
      if (r === 'kill') return this.killMonster(m)
      this.checkPhase(act, m)
    }

    const partyTurn = this.companyTick(act, m, dt, ps)
    if (partyTurn === 'end') return
    if (partyTurn === 'kill') return this.killMonster(m)

    if (!this.hasStatus(act, 'monster', 'stun') && !act.mech?.charge) act.mTimer += dt / (1 + this.slowOf(act, 'monster'))
    const mSpeed = m.speed * this.phaseOf(act).speed * (act.mb?.frenzy ? CREATURE_BUFFS.frenzy.speed : 1)
    if (act.mTimer >= mSpeed) {
      act.mTimer -= mSpeed
      if (Math.random() < this.heroDrawShare(act)) {
        // Agility dodges the blow; a shield may block half of it
        if (Math.random() < this.dodgeChance() + this.buffValue(act, 'dodge')) { this.emit('hit', { who: 'monster', dmg: 0, dodged: true }); return }
        const hit = Math.random() < this.hitChance(mr.accRoll, ps.defRoll)
        let dmg = hit ? rand(0, Math.round(m.maxHit * this.phaseOf(act).maxHit)) : 0
        const enraged = act.mHp < m.hp * 0.3 ? this.traitValue(m, 'enrage') : 0
        dmg = Math.round(dmg * (1 + enraged) * (1 - this.weakenOf(act, 'monster')) * (1 - this.buffValue(act, 'ward')) * (1 - this.damageReduction()))
        const blocked = dmg > 0 && Math.random() < this.blockChance()
        if (blocked) dmg = Math.floor(dmg / 2)
        this.s.hp -= dmg
        this.track(act, 'taken', dmg)
        this.emit('hit', { who: 'monster', dmg, blocked })
        if (dmg > 0) {
          this.gainEnergy(act, ENERGY.struck)
          const drain = this.traitValue(m, 'drain')
          if (drain) act.mHp = Math.min(m.hp, act.mHp + Math.round(dmg * drain))
          for (const id of this.monsterTraits(m)) { const on = TRAITS[id].on; if (on && Math.random() < on.chance) this.addStatus(act, 'player', on.id, dmg) }
        }
        this.autoEat()
        if (this.s.hp <= 0) return this.die(m)
        if (this.shouldRetreat(act)) return this.retreat(m)
      } else this.emit('hit', { who: 'monster-merc', dmg: 0 })
    }
  },

  killMonster(m) {
    const act = this.s.activity
    if (act.kind === 'weekly') return this.weeklyKilled(m)
    const st = this.s
    st.stats.kills++
    st.killsBy[m.id] = (st.killsBy[m.id] || 0) + 1
    this.countBeast(m.id)
    this.festivalKill(m)
    this.addStreak()
    act.runKills++
    this.companyKill(m, act)
    // A thief that falls gives back what it took
    if (act.stolen > 0) {
      st.gold += act.stolen
      this.note(act, 'recovered', { gold: act.stolen })
      act.stolen = 0
    }
    if (this.tracker) this.tracker.kills[m.id] = (this.tracker.kills[m.id] || 0) + 1
    // Elites pay far better: more gold, likelier drops and a little stardust
    const elite = !!act.elite
    // A troubled region pays more for its trouble, and every hunt there calms it down
    const region = act.kind === 'area' ? this.regionShare(m) : 0
    if (act.kind === 'area') this.easeThreat(m.id, elite)
    const gold = this.addGold(rand(m.gold[0], m.gold[1]) * (elite ? ELITE_LOOT.gold : 1) * (1 + region * REGION_GOLD), true)
    const loot = []
    const lootMult = (1 + this.mod('loot') + region * REGION_LOOT + this.homeEffect(m, 'loot')) * (elite ? ELITE_LOOT.drops : 1)
    if (elite) {
      const dust = rand(...ELITE_LOOT.stardust)
      this.addItem('stardust', dust)
      loot.push({ item: 'stardust', n: dust })
      st.stats.elites = (st.stats.elites || 0) + 1
      this.log('crowned-skull', 'log.elite', { monster: '@monster:' + m.id, kind: '@elite:' + act.elite })
      if (act.elite === 'superior') loot.push({ item: 'slayer_sigil', n: this.superiorLoot(m) })
    }
    m.drops.forEach(d => {
      // A Blood Moon makes rare drops (under 5%) more likely on top of the loot bonus
      if (Math.random() < Math.min(1, d.chance * lootMult * (d.chance < 0.05 ? this.omenRareMult() : 1))) {
        const n = rand(d.qty[0], d.qty[1])
        this.addItem(d.item, n)
        this.recordDrop(m.id, d.item)
        loot.push({ item: d.item, n })
        if (d.chance < 0.05) {
          if (ITEMS[d.item].rare) st.stats.rares++
          this.log(ITEMS[d.item].icon, 'log.drop', { monster: '@monster:' + m.id, item: '@item:' + d.item })
          this.emit('rare', { item: d.item, n })
        }
      }
    })
    for (const id of this.mythicKill(m, act)) loot.push({ item: id, n: 1 })
    const task = st.slayer.task
    let taskDone = false
    if (task && task.monster === m.id) {
      this.addXp('slayer', Math.round(m.hp * this.slayerXpMult()))
      task.left--
      if (task.left <= 0) { this.completeSlayerTask(); taskDone = true }
    }
    if (act.kind === 'tower') {
      const tokens = Math.round((1 + Math.floor(m.floor / 10)) * (m.floor % 10 === 0 ? 3 : 1) * (m.affix ? AFFIX_TOKENS : 1))
      // A guardian's first defeat pays a reward of its own
      st.tower.cleared ||= {}
      if (m.floor % 10 === 0 && !st.tower.cleared[m.floor]) {
        st.tower.cleared[m.floor] = true
        const r = guardianReward(m.floor)
        st.tower.tokens += r.tokens
        Object.entries(r.items).forEach(([k, n]) => this.addItem(k, n))
        this.log('stone-tower', 'log.guardian', { guardian: '@guardian:' + guardianOf(m.floor), floor: m.floor })
        this.emit('guardian', { floor: m.floor, id: guardianOf(m.floor), reward: r })
      }
      const rushed = tokens * this.towerTokenMult()
      st.tower.tokens += rushed
      this.fairFloor()
      if (this.tracker) this.tracker.tokens = (this.tracker.tokens || 0) + rushed
      if (m.floor > st.tower.best && m.floor % 10 === 0) this.log('stone-tower', 'log.towerFloor', { floor: m.floor })
      st.tower.best = Math.max(st.tower.best, m.floor)
      this.recordFloor(m.floor)
      act.floor++
      act.respawn = 1
    } else if (act.kind === 'dungeon') {
      const dg = DUNGEONS.find(d => d.id === act.target)
      act.room++
      act.respawn = 1
      if (act.room > dg.rooms.length) {
        const got = {}
        dg.chest.forEach(c => { if (Math.random() < Math.min(1, c.chance * lootMult)) { const n = rand(c.qty[0], c.qty[1]); this.addItem(c.item, n); got[c.item] = n } })
        st.dungeonsBy[dg.id] = (st.dungeonsBy[dg.id] || 0) + 1
        st.stats.dungeons = (st.stats.dungeons || 0) + 1
        act.clears++
        act.room = 0
        act.respawn = 3
        if (st.dungeonsBy[dg.id] === 1) this.log(dg.icon, 'log.dungeonFirst', { dungeon: '@dungeon:' + dg.id })
        this.emit('dungeon', { dg, got })
      }
    } else act.respawn = m.boss ? m.respawn : RESPAWN_TIME
    if (m.boss && !m.dungeon && st.killsBy[m.id] === 1) this.log('trophy', 'log.bossFirst', { monster: '@monster:' + m.id })
    if (m.boss) this.rollMonsterPet(m.id)
    if (m.echo) this.echoDefeated(m)
    this.omenKill(m)
    if (act.kind === 'festival') this.festivalCreatureKilled()
    this.emit('kill', { monster: m, gold, loot })
    // Tactics: a finished slayer task can end the hunt in the open field
    if (taskDone && this.s.tactics?.stopOnTask && act.kind === 'area') this.stop(msg('tactics.taskDone', { monster: '@monster:' + m.id }))
  },

  die(m) {
    const act = this.s.activity
    this.s.stats.deaths++
    if (act.kind !== 'weekly') this.loseStreak()
    this.companyFell(act)
    this.s.hp = this.maxHp()
    // Falling to the weekly boss only ends the attempt
    const lost = act.kind === 'weekly' || act.kind === 'festival' ? 0 : Math.floor(this.s.gold * this.diff().death)
    if (lost > 0) this.s.gold -= lost
    this.log('broken-skull', lost > 0 ? 'log.deathGold' : 'log.death', { monster: '@monster:' + m.id, gold: lost })
    if (act.kind === 'dungeon') this.stop(msg('msg.diedDungeon', { dungeon: '@dungeon:' + act.target, room: act.room + 1, gold: lost }))
    else if (act.kind === 'tower') this.stop(msg('msg.diedTower', { floor: act.floor, best: this.s.tower.best, gold: lost }))
    else if (act.kind === 'weekly') this.stop(msg('weekly.drivenBack', { boss: '@weekly:' + m.id, dmg: Math.round(act.dealt) }))
    else this.stop(msg('msg.died', { monster: '@monster:' + m.id, gold: lost }))
    this.emit('death', m)
  },

  /* ================= tower ================= */
  // A tower floor's creature with this week's affix, and a named guardian on every tenth floor
  towerFloor(floor) {
    let m = towerMonster(floor)
    const id = affixOf(floor), a = id && TOWER_AFFIXES[id]
    if (a) {
      m = cloneNamed(m, {
        affix: id, traits: a.trait ? [a.trait] : [],
        speed: m.speed * (a.speed || 1), maxHit: Math.max(1, Math.round(m.maxHit * (a.maxHit || 1))),
      })
    }
    if (floor % 10 === 0) {
      const g = guardianOf(floor)
      m = named(cloneNamed(m, { guardian: g }), () => t(`tower.guardians.${g}`) + ' ★')
    }
    return m
  },
  // The hero against the best climbers of the realm's guilds
  towerRivals() {
    const s = this.s.guilds
    const day = Math.floor(Date.now() / 86400e3), days = Math.max(0, day - (s?.founded || day))
    const list = []
    for (const g of this.guildList()) {
      for (const m of guildRoster(g, day, s.founded).slice(0, 3)) list.push({ name: m.name, role: m.role, guild: g.id, best: rivalBest(m, g.tier, days) })
    }
    list.push({ name: this.s.name, role: this.s.role, best: this.s.tower.best, hero: true })
    return list.sort((a, b) => b.best - a.best || (b.hero ? 1 : 0) - (a.hero ? 1 : 0)).map((r, i) => ({ ...r, place: i + 1 }))
  },
  buyTower(id) {
    const it = TOWER_SHOP.find(x => x.id === id)
    if (!it || this.s.tower.tokens < it.cost) return false
    this.s.tower.tokens -= it.cost
    if (it.item) this.addItem(it.item, 1)
    if (it.items) Object.entries(it.items).forEach(([k, q]) => this.addItem(k, q))
    return true
  },
}
