/* =========================================================
   PROGRESS — quests, achievements, the home, blessings at the church and prestige.
   Mixed into G (engine.js); `this` is the engine.
   ========================================================= */
import { XP_TABLE, MAX_LEVEL } from './data/skills.js'
import { QUESTS, ACHIEVEMENTS, ROOMS, BLESSINGS, QUEST_STATS } from './data/progression.js'


export const progress = {
  /* ================= quests ================= */
  questDone(id) { return this.s.quests[id]?.status === 'done' },
  questsDone() { return Object.values(this.s.quests).filter(q => q.status === 'done').length },
  questPoints() { return QUESTS.filter(q => this.questDone(q.id)).reduce((s, q) => s + (q.reward.qp || 0), 0) },
  questReqMet(q) { return (q.req.quests || []).every(id => this.questDone(id)) && this.meetsReq(q.req.levels) },
  questStatus(q) {
    const st = this.s.quests[q.id]?.status
    if (st) return st
    return this.questReqMet(q) ? 'available' : 'locked'
  },
  startQuest(id) {
    const q = QUESTS.find(x => x.id === id)
    if (!q || this.questStatus(q) !== 'available') return
    const base = {}
    q.obj.forEach(o => {
      if (o.type === 'kill') base[o.monster] = this.s.killsBy[o.monster] || 0
      if (o.type === 'stat') base['stat:' + o.key] = QUEST_STATS[o.key](this)
    })
    this.s.quests[id] = { status: 'active', base, slayerBase: this.s.slayer.completed }
  },
  objProgress(q, o) {
    const qs = this.s.quests[q.id]
    switch (o.type) {
      case 'item': return { cur: Math.min(this.qty(o.item), o.qty), max: o.qty }
      case 'kill': return { cur: Math.min((this.s.killsBy[o.monster] || 0) - (qs?.base?.[o.monster] || 0), o.qty), max: o.qty }
      case 'level': return { cur: Math.min(this.level(o.skill), o.lvl), max: o.lvl }
      case 'tower': return { cur: Math.min(this.s.tower.best, o.floor), max: o.floor }
      case 'slayer': return { cur: Math.min(this.s.slayer.completed - (qs?.slayerBase || 0), o.tasks), max: o.tasks }
      case 'stat': return { cur: Math.max(0, Math.min(QUEST_STATS[o.key](this) - (qs?.base?.['stat:' + o.key] || 0), o.qty)), max: o.qty }
      case 'reach': return { cur: Math.min(QUEST_STATS[o.key](this), o.qty), max: o.qty }
    }
    return { cur: 0, max: 1 }
  },
  questReady(q) { return this.s.quests[q.id]?.status === 'active' && q.obj.every(o => { const p = this.objProgress(q, o); return p.cur >= p.max }) },
  completeQuest(id) {
    const q = QUESTS.find(x => x.id === id)
    if (!q || !this.questReady(q)) return false
    q.obj.forEach(o => { if (o.type === 'item') this.removeItem(o.item, o.qty) })
    const r = q.reward
    if (r.gold) this.addGold(r.gold)
    Object.entries(r.xp || {}).forEach(([k, v]) => this.addXp(k, v, false))
    Object.entries(r.items || {}).forEach(([k, v]) => this.addItem(k, v))
    if (r.slayerPoints) this.s.slayer.points += r.slayerPoints
    this.s.quests[id].status = 'done'
    this.log(q.icon, 'log.quest', { quest: '@quest:' + q.id })
    this.emit('quest', q)
    return true
  },

  /* ================= achievements ================= */
  checkAchievements() {
    ACHIEVEMENTS.forEach(a => {
      if (this.s.achievements[a.id]) return
      let ok = false
      try { ok = a.check(this) } catch { ok = false }
      if (ok) {
        this.s.achievements[a.id] = Date.now()
        if (a.gold) this.addGold(a.gold)
        this.log(a.icon, 'log.achievement', { ach: '@ach:' + a.id })
        this.emit('achievement', a)
      }
    })
  },

  /* ================= home ================= */
  roomCost(r) { return r.cost(this.room(r.id)) },
  canBuild(r) {
    if (this.room(r.id) >= r.max) return false
    const c = this.roomCost(r)
    return this.s.gold >= c.gold && this.hasItems(c.items)
  },
  build(id) {
    const r = ROOMS.find(x => x.id === id)
    if (!r || !this.canBuild(r)) return false
    const c = this.roomCost(r)
    this.s.gold -= c.gold
    Object.entries(c.items).forEach(([k, q]) => q > 0 && this.removeItem(k, q))
    this.s.rooms[id] = this.room(id) + 1
    this.ensurePlots()
    this.ensureHomeWork()
    this.log(r.icon, 'log.room', { room: '@room:' + r.id, level: this.room(id) })
    return true
  },

  /* ================= church ================= */
  activeBlessings() { return Object.values(this.s.blessings).filter(v => v > 0).length },
  bless(id) {
    const b = BLESSINGS.find(x => x.id === id)
    if (!b || this.level('prayer') < b.lvl || this.s.gold < this.blessingCost(b)) return false
    if (!this.blessed(id) && this.activeBlessings() >= this.maxBlessings()) return false
    this.s.gold -= this.blessingCost(b)
    this.s.blessings[id] = this.blessingDuration()
    return true
  },

  /* ================= prestige ================= */
  canPrestige(skill) { return this.level(skill) >= MAX_LEVEL },
  doPrestige(skill) {
    if (!this.canPrestige(skill)) return false
    this.s.skills[skill].xp = skill === 'hitpoints' ? XP_TABLE[10] : 0
    this.s.prestige[skill] = this.prestigeOf(skill) + 1
    if (skill === 'hitpoints') this.s.hp = Math.min(this.s.hp, this.maxHp())
    const act = this.s.activity
    if (act && act.type === 'skill' && act.skill === skill) this.stop()
    this.log('sparkles', 'log.prestige', { n: this.prestigeOf(skill), skill: '@skill:' + skill })
    return true
  },
}
