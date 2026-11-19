/* =========================================================
   SKILLING — skill actions (gathering, crafting, chained crafting), fishing and real-time farming.
   Mixed into G (engine.js); `this` is the engine.
   ========================================================= */
import { ITEMS, CROPS } from './data/items.js'
import { ACTIONS, findAction, QUALITIES, qualityChances, withQuality, FISH_INFO } from './data/actions.js'
import { BAITS, MASTERY_LUCK } from './data/fishing.js'
import { MASTERY, masteryXpPerAction, TOOL_TYPES, TOOL_SPEED_PER_TIER } from './data/character.js'


const CHAIN_DEPTH = 3   // how many steps down the chained crafting may go
const CHAIN_BATCH = 10  // batches to prepare for an endless action
const SEED_POUCH_CHANCE = 0.04
const msg = (key, params = {}) => ({ key, params })
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1))
const CROP_MAP = Object.fromEntries(CROPS.map(c => [c.id, c]))

export const skilling = {
  /* ================= skill actions ================= */
  getAction: findAction,
  actionTime(skill, a) { return a.time / (this.speedFactor(skill) + this.masteryLevel(skill, a.id) * MASTERY.speedPer) },
  hasTool(a) { return !a.tool || this.toolTier(a.tool.type) >= a.tool.tier },
  canDo(skill, a) { return this.level(skill) >= a.lvl && this.hasItems(a.in) && this.hasTool(a) && this.festivalOpen(a) },
  burnChance(skill, a) { return this.raceTrait('flame') ? 0 : Math.max(0, 0.45 - (this.level(skill) - a.lvl) * 0.025) * (1 - this.room('kitchen') * 0.3) * (1 - this.momentumBonus(skill)) },
  failChance(skill, a) { return Math.min(0.55, Math.max(0.03, 0.55 - (this.level(skill) - a.lvl) * 0.012 - this.mod('thieving') - Math.min(0.12, this.level('agility') * 0.0012) - this.toolTier('lockpick') * 0.015 + (skill === 'thieving' ? this.heatFail() : 0))) },
  runeMult(skill, a) { return 1 + Math.floor((this.level(skill) - a.lvl) / 12) },

  startSkill(skill, actionId) {
    const a = findAction(skill, actionId)
    if (!a) return
    const cur = this.s.activity
    if (cur && cur.type === 'skill' && cur.skill === skill && cur.action === actionId) return this.stop()
    if (this.level(skill) < a.lvl) return this.toast('padlock', 'msg.needLevel', { lvl: a.lvl, skill: '@skill:' + skill }, 'warn')
    if (skill === 'thieving' && this.jailed()) return this.toast('padlock', 'thief.inJail', {}, 'warn')
    if (!this.festivalOpen(a)) return this.toast('campfire', 'festival.closed', {}, 'warn')
    if (!this.hasTool(a)) return this.toast(TOOL_TYPES[a.tool.type].icon, 'msg.needTool', { tool: TOOL_TYPES[a.tool.type].name, tier: a.tool.tier }, 'warn')
    if (!this.hasItems(a.in) && !this.canChain(a)) return this.toast('knapsack', 'msg.noMaterials', {}, 'warn')
    this.s.activity = { type: 'skill', skill, action: actionId, progress: 0 }
    this.emit('activity')
  },

  /* ---------- chained crafting ---------- */
  // An action the player can run that produces `item`, following missing inputs a few steps down
  producerFor(item, depth = 0) {
    if (depth >= CHAIN_DEPTH) return null
    let best = null
    for (const [skill, list] of Object.entries(ACTIONS)) {
      for (const a of list) {
        if (!(a.out[item] || (a.catch?.[item] && this.level('fishing') >= FISH_INFO[item].lvl)) || this.level(skill) < a.lvl || !this.hasTool(a)) continue
        if (best && a.lvl <= best.a.lvl) continue
        if (Object.entries(a.in).every(([k, q]) => this.qty(k) >= q || this.producerFor(k, depth + 1))) best = { skill, a }
      }
    }
    return best
  },
  canChain(a) {
    return !!this.s.settings.autoChain && Object.entries(a.in).every(([k, q]) => this.qty(k) >= q || this.producerFor(k))
  },
  canStart(skill, a) { return this.level(skill) >= a.lvl && this.hasTool(a) && (this.hasItems(a.in) || this.canChain(a)) },
  // Switch to making the first missing material; the current action is resumed afterwards
  tryChain(act, a) {
    if (!this.s.settings.autoChain || act.noChain) return false
    let depth = 0
    for (let p = act.parent; p; p = p.parent) depth++
    if (depth >= CHAIN_DEPTH) return false
    const batches = act.limit ? act.limit - act.done : CHAIN_BATCH
    const item = Object.keys(a.in).find(k => this.qty(k) < a.in[k])
    const p = item && this.producerFor(item, depth)
    if (!p) return false
    const need = a.in[item] * batches - this.qty(item)
    this.s.activity = {
      type: 'skill', skill: p.skill, action: p.a.id, progress: 0, done: 0,
      limit: Math.max(1, Math.ceil(need / (p.a.out[item] || Math.max(0.05, this.catchChance(p.a, item))))),
      parent: { skill: act.skill, action: act.action, limit: act.limit, done: act.done || 0, parent: act.parent },
    }
    this.emit('activity')
    return true
  },
  // Back to the action that asked for the materials; if nothing was made, don't chain again
  resumeParent(act) {
    const p = act.parent
    this.s.activity = { type: 'skill', skill: p.skill, action: p.action, progress: 0, limit: p.limit, done: p.done, parent: p.parent, noChain: act.done === 0 }
    this.emit('activity')
  },

  // `reason` is an optional { key, params } message shown to the player
  stop(reason) {
    if (!this.s.activity) return
    this.endBrace?.(this.s.activity)
    this.s.activity = null
    if (this.tracker && reason) this.tracker.stopReason = reason
    this.emit('activity')
    if (reason) this.emit('toast', { icon: 'hourglass', msg: reason, kind: 'warn' })
  },

  completeAction(skill, a) {
    const act = this.s.activity
    if (!(Object.keys(a.in).length && Math.random() < this.preserveChance(skill, a.id))) {
      Object.entries(a.in).forEach(([k, q]) => this.removeItem(k, q))
    }
    this.s.stats.actions++
    this.buildMomentum(skill)
    this.addMastery(skill, a.id, masteryXpPerAction(a.time))
    this.rollSkillPet(skill, a.time)
    this.festivalAction(a.time)
    this.omenAction(a.time)

    if (a.fail && Math.random() < this.failChance(skill, a)) {
      const dmg = rand(a.fail.dmg[0], a.fail.dmg[1])
      this.s.hp -= dmg
      act.progress -= 2 // stunned
      this.autoEat()
      this.emit('gain', msg('gain.caught', { dmg }))
      if (skill === 'thieving' && this.thiefCaught()) return
      if (this.s.hp <= 0) { this.s.hp = 1; this.stop(msg('msg.faintedThieving')) }
      return
    }
    if (a.burn && Math.random() < this.burnChance(skill, a)) {
      this.breakMomentum(skill)
      this.addItem('burnt_food', 1)
      this.s.stats.burnt++
      this.emit('gain', msg('gain.burnt'))
      return
    }
    const double = Math.random() < this.doubleChance(skill, a.id) ? 2 : 1
    let gain = null
    let xp = a.xp
    // Fishing waters: each cast lands one fish at random
    if (a.catch) {
      const fish = this.rollCatch(a)
      this.addItem(fish, double)
      xp = FISH_INFO[fish].xp
      gain = msg('gain.item', { n: double, item: '@item:' + fish })
      this.s.stats.fish = (this.s.stats.fish || 0) + double
      this.fairCatch(FISH_INFO[fish].lvl)
      this.festivalCatch(fish)
      this.emit('catch', { fish, water: a.id, n: double })
    }
    Object.entries(a.out).forEach(([k, q]) => {
      let n = q
      if (a.runeMult) n = q * this.runeMult(skill, a)
      n *= double
      // Crafted gear can come out finer: each piece rolls its own quality
      if (a.quality) {
        for (let i = 0; i < n; i++) {
          const id = withQuality(k, this.rollQuality(skill, a.id))
          this.addItem(id, 1)
          gain = msg('gain.item', { n: 1, item: '@item:' + id })
        }
        return
      }
      this.addItem(k, n)
      gain = msg('gain.item', { n, item: '@item:' + k })
    })
    if (a.gold) gain = msg('gain.gold', { n: this.addGold(rand(a.gold[0], a.gold[1]) * double, true) })
    let bonus = null
    ;(a.extra || []).forEach(e => {
      if (Math.random() < e.chance * (1 + this.mod('loot')) * (a.catch && e.item === 'casket' ? this.baitCasket() : 1)) {
        const n = rand(e.qty[0], e.qty[1])
        this.addItem(e.item, n)
        bonus = '@item:' + e.item
        if (e.chance < 0.02) { this.log(ITEMS[e.item].icon, 'log.found', { item: '@item:' + e.item }); this.emit('rare', { item: e.item, n }) }
      }
    })
    const myth = this.mythicAction(skill, a.time)
    if (myth.length) bonus = '@item:' + myth[0]
    xp = this.techniqueAfter(skill, a, xp, double)
    this.addXp(skill, xp)
    gain ||= msg('gain.xp', { n: Math.round(xp * this.xpMult(skill)) })
    if (skill === 'thieving') { const loot = this.thiefSucceeded(a); if (loot) bonus = '@item:' + loot }
    this.emit('gain', { ...gain, double: double > 1, bonus })
  },

  // Chances of [fine, superior, masterwork] for a recipe
  qualityChances(skill, id) { return qualityChances(this.masteryLevel(skill, id), this.mod('quality')) },
  rollQuality(skill, id) {
    const [fine, sup, master] = this.qualityChances(skill, id)
    const r = Math.random()
    let q = 0
    if (r < master) q = 3
    else if (r < master + sup) q = 2
    else if (r < master + sup + fine) q = 1
    if (q) {
      const st = this.s.stats
      st.quality = st.quality || {}
      st.quality[q] = (st.quality[q] || 0) + 1
    }
    if (q === 3) {
      const out = Object.keys(findAction(skill, id).out)[0]
      this.log('anvil-impact', 'log.masterwork', { item: '@item:' + withQuality(out, 3) })
      this.emit('masterwork', { item: withQuality(out, 3), quality: QUALITIES[3] })
    }
    return q
  },

  /* ================= fishing ================= */
  activeBait() { const b = this.s.bait; return b && BAITS[b] && this.qty(b) > 0 ? b : null },
  baitCasket() { const b = this.activeBait(); return (b && BAITS[b].casket) || 1 },
  // The fish a water can give the hero right now and the chance of each: finer fish get likelier with
  // bait, mastery of the water and luck
  catchTable(a, lvl = this.level('fishing'), bait = this.activeBait()) {
    const all = Object.entries(a.catch).sort((x, y) => FISH_INFO[x[0]].lvl - FISH_INFO[y[0]].lvl)
    const open = all.filter(([id]) => FISH_INFO[id].lvl <= lvl)
    const list = open.length ? open : all.slice(0, 1)
    const shift = (bait ? BAITS[bait].power : 0) + this.masteryLevel('fishing', a.id) * MASTERY_LUCK + this.mod('fishLuck')
    const weights = list.map(([id, w], rank) => [id, w * (1 + shift * rank)])
    const total = weights.reduce((s, [, w]) => s + w, 0)
    return all.map(([id]) => {
      const w = weights.find(x => x[0] === id)
      return { id, lvl: FISH_INFO[id].lvl, chance: w ? w[1] / total : 0, locked: !w }
    })
  },
  catchChance(a, fish) { return this.catchTable(a).find(r => r.id === fish)?.chance || 0 },
  // One cast: uses a bait if one is chosen (workers do not)
  rollCatch(a, lvl = this.level('fishing'), useBait = true) {
    const bait = useBait ? this.activeBait() : null
    const table = this.catchTable(a, lvl, bait).filter(r => !r.locked)
    if (bait) this.removeItem(bait, 1)
    let r = Math.random()
    for (const row of table) { if ((r -= row.chance) < 0) return row.id }
    return table[table.length - 1].id
  },

  updateSkill(dt) {
    const act = this.s.activity
    const a = findAction(act.skill, act.action)
    if (!a) return this.stop()
    act.progress += dt
    const dur = this.actionTime(act.skill, a)
    while (act.progress >= dur && this.s.activity === act) {
      if (!this.canDo(act.skill, a)) {
        if (this.level(act.skill) >= a.lvl && this.tryChain(act, a)) return
        if (act.parent) return this.resumeParent(act)
        if (this.s.queue.length) {
          this.toast('hourglass', 'msg.queueSkipMaterials', { action: `@action:${act.skill}/${a.id}` }, 'warn')
          return this.queueFinished()
        }
        return this.stop(msg('msg.outOfMaterials', { action: `@action:${act.skill}/${a.id}` }))
      }
      act.progress -= dur
      this.completeAction(act.skill, a)
      if (act.limit && ++act.done >= act.limit && this.s.activity === act) return act.parent ? this.resumeParent(act) : this.queueFinished()
    }
  },

  /* ================= real-time farming ================= */
  plotCount() {
    const hl = this.heroLevel()
    return 3 + this.room('garden') + (hl >= 20 ? 1 : 0) + (hl >= 50 ? 1 : 0)
  },
  ensurePlots() {
    const plots = this.s.farm.plots
    while (plots.length < this.plotCount()) plots.push(null)
  },
  growTime(crop) { return crop.grow / (1 + this.mod('farmSpeed') + this.masteryLevel('farming', crop.id) * MASTERY.speedPer + this.toolTier('sickle') * TOOL_SPEED_PER_TIER + this.wellSpeed()) },
  plant(i, cropId) {
    const c = CROP_MAP[cropId]
    if (!c || this.s.farm.plots[i] || i >= this.plotCount()) return false
    if (this.level('farming') < c.lvl) { this.toast('padlock', 'msg.needLevel', { lvl: c.lvl, skill: '@skill:farming' }, 'warn'); return false }
    if (this.qty(c.id + '_seed') <= 0) { this.toast('plant-seed', 'msg.noSeeds', { item: '@item:' + c.id + '_seed' }, 'warn'); return false }
    this.removeItem(c.id + '_seed', 1)
    const time = this.growTime(c)
    this.s.farm.plots[i] = { crop: c.id, t: time, total: time }
    return true
  },
  plantAll(cropId) {
    let n = 0
    this.s.farm.plots.forEach((p, i) => { if (!p && this.qty(cropId + '_seed') > 0 && this.plant(i, cropId)) n++ })
    return n
  },
  harvest(i, replant = false) {
    const p = this.s.farm.plots[i]
    if (!p || p.t > 0) return null
    const c = CROP_MAP[p.crop]
    const base = rand(c.yield[0], c.yield[1]) + Math.floor(this.mod('farmYield')) + Math.floor(this.masteryLevel('farming', c.id) / 20) + Math.floor(this.toolTier('sickle') / 2)
    const n = this.plotYield(p, base) * (Math.random() < this.doubleChance('farming', c.id) ? 2 : 1)
    this.addItem(c.id, n)
    const cross = this.tryCross(i)
    this.festivalHarvest(p, n)
    this.festivalGiant()
    if (p.event === 'bountiful') this.s.stats.bountiful = (this.s.stats.bountiful || 0) + 1
    this.addXp('farming', c.harvestXp)
    this.addMastery('farming', c.id, 10 + c.grow / 30)
    this.s.stats.harvests = (this.s.stats.harvests || 0) + 1
    // Now and then a harvest turns up a pouch of seeds
    if (Math.random() < SEED_POUCH_CHANCE * (1 + this.mod('loot'))) this.addItem('seed_pouch', 1)
    this.rollSkillPet('farming')
    // A harvest rolls like a few actions, as crops take minutes to grow
    this.mythicAction('farming', 12)
    this.omenAction(3)
    this.s.farm.plots[i] = null
    if (replant && this.qty(c.id + '_seed') > 0 && this.level('farming') >= c.lvl) this.plant(i, c.id)
    return { item: c.id, n, event: p.event || null, cross }
  },
  harvestAll() {
    let total = 0
    this.s.farm.plots.forEach((p, i) => { if (p && p.t <= 0) { const r = this.harvest(i, this.s.farm.auto); if (r) total += r.n } })
    return total
  },
  updateFarm(dt) {
    const plots = this.s.farm.plots
    for (let i = 0; i < plots.length; i++) {
      const p = plots[i]
      if (!p) continue
      if (p.t > 0) p.t = Math.max(0, p.t - dt)
      if (!p.rolled && p.t <= p.total / 2) this.rollPlotEvent(p)
      if (p.t <= 0 && this.s.farm.auto) this.harvest(i, true)
    }
  },
  farmBusy() { return this.s.farm.plots.some(p => p && p.t > 0) },
}
