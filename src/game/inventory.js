/* =========================================================
   INVENTORY — items in the bag, equipment and tools, health, food and potions.
   Mixed into G (engine.js); `this` is the engine.
   ========================================================= */
import { ITEMS, CROPS, GEMS, POTION_DURATION } from './data/items.js'
import { findAction } from './data/actions.js'
import { FRAIL_HP } from './data/trials.js'


const ELIXIR_DURATION = 1800
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1))

export const inventory = {
  /* ================= inventory ================= */
  qty(id) { return this.s.inventory[id] || 0 },
  addItem(id, n = 1) {
    if (n <= 0 || !ITEMS[id]) return
    this.s.inventory[id] = this.qty(id) + n
    this.recordItem(id)
    if (this.tracker) this.tracker.items[id] = (this.tracker.items[id] || 0) + n
  },
  removeItem(id, n = 1) {
    const q = this.qty(id) - n
    if (q <= 0) delete this.s.inventory[id]
    else this.s.inventory[id] = q
    if (this.tracker) this.tracker.items[id] = (this.tracker.items[id] || 0) - n
    if (q <= 0) {
      if (this.s.food === id) this.s.food = null
      if (this.s.potion === id) this.s.potion = null
      if (this.s.equipment.ammo === id) this.s.equipment.ammo = null
    }
  },
  hasItems(items) { return Object.entries(items || {}).every(([k, q]) => this.qty(k) >= q) },
  addGold(n, mult = false) {
    n = Math.floor(n * (mult ? this.goldMult() : 1))
    this.s.gold += n
    this.s.stats.goldEarned += n
    if (this.tracker) this.tracker.gold += n
    return n
  },
  sellPrice(id) { return Math.floor(ITEMS[id].value * this.goldMult() * this.marketMult(id)) },
  sell(id, n) {
    n = Math.min(n, this.qty(id))
    if (n <= 0 || this.isLocked(id)) return 0
    const earned = this.sellPrice(id) * n
    this.removeItem(id, n)
    this.s.gold += earned
    this.s.stats.goldEarned += earned
    return earned
  },
  sellJunk() {
    let total = 0
    Object.keys(this.s.inventory).forEach(id => { if (ITEMS[id]?.type === 'junk') total += this.sell(id, this.qty(id)) })
    return total
  },
  buy(id, n, price) {
    const cost = n * price
    // A self-made life buys nothing from the shop
    if (this.underTrial('selfmade')) { this.toast('anvil-impact', 'trials.shopClosed', {}, 'warn'); return false }
    if (n <= 0 || this.s.gold < cost) return false
    this.s.gold -= cost
    this.addItem(id, n)
    return true
  },
  openChest(id) {
    if (this.qty(id) <= 0) return null
    this.removeItem(id, 1)
    const got = {}
    const give = (item, n) => { this.addItem(item, n); got[item] = (got[item] || 0) + n }
    if (id === 'bird_nest') {
      const pool = CROPS.filter(c => c.lvl <= 60 && !c.hybrid)
      const c = pool[Math.floor(Math.pow(Math.random(), 2) * pool.length)]
      give(c.id + '_seed', rand(1, 3))
      // Sometimes a stone sits among the eggs
      if (Math.random() < 0.06) give('uncut_' + GEMS[Math.floor(Math.pow(Math.random(), 2) * GEMS.length)].id, 1)
    } else if (id === 'geode') {
      // Ores of the hero's level, a gem or two and a pinch of stardust
      const rocks = ['copper_ore', 'iron_ore', 'coal', 'gold_ore', 'mithril_ore', 'adamantite_ore', 'runite_ore'].filter(o => findAction('mining', o)?.lvl <= this.level('mining'))
      const ore = rocks[Math.floor(Math.random() * rocks.length)] || 'copper_ore'
      give(ore, rand(3, 8))
      give('uncut_' + GEMS[Math.floor(Math.pow(Math.random(), 1.6) * GEMS.length)].id, rand(1, 2))
      if (Math.random() < 0.5) give('stardust', rand(2, 6))
    } else if (id === 'casket') {
      got.gold = this.addGold(rand(80, 300) + this.level('fishing') * 4, true)
      if (Math.random() < 0.5) give('uncut_' + GEMS[Math.floor(Math.pow(Math.random(), 1.8) * GEMS.length)].id, 1)
      if (Math.random() < 0.35) { const seeds = CROPS.filter(c => !c.hybrid), c = seeds[Math.floor(Math.random() * seeds.length)]; give(c.id + '_seed', rand(1, 3)) }
      if (Math.random() < 0.04) give('treasure_map', 1)
    } else if (id === 'seed_pouch') {
      // Better seeds than a nest: up to a little above the hero's Farming level
      const pool = CROPS.filter(c => c.lvl <= this.level('farming') + 10 && !c.hybrid)
      for (let i = 0, n = rand(2, 3); i < n; i++) { const c = pool[Math.floor(Math.pow(Math.random(), 0.7) * pool.length)]; give(c.id + '_seed', rand(1, 2)) }
    } else if (id === 'coin_pouch') {
      got.gold = this.addGold(rand(40, 160), true)
    } else if (id === 'gem_chest') {
      for (let i = 0, n = rand(2, 4); i < n; i++) {
        const r = Math.random()
        const g = r < 0.5 ? GEMS[0] : r < 0.8 ? GEMS[1] : r < 0.95 ? GEMS[2] : GEMS[3]
        give('uncut_' + g.id, 1)
      }
    }
    return got
  },

  /* ================= equipment and tools ================= */
  bonuses() {
    const b = { atk: 0, str: 0, def: 0, rAtk: 0, rStr: 0, mAtk: 0, mDmg: 0 }
    // Enchant levels belong to the slot, so they scale whatever is equipped there
    Object.entries(this.s.equipment).forEach(([slot, id]) => {
      if (!id || !ITEMS[id]) return
      const mult = slot === 'ammo' ? 1 : this.enchantMult(slot)
      Object.entries(ITEMS[id].stats || {}).forEach(([k, v]) => (b[k] += k === 'mDmg' ? v * mult : Math.round(v * mult)))
    })
    return b
  },
  meetsReq(req) { return Object.entries(req || {}).every(([sk, l]) => this.level(sk) >= l) },
  canEquip(id) {
    const it = ITEMS[id]
    return !!it && (it.type === 'equip' || it.type === 'tool') && this.meetsReq(it.req)
  },
  equip(id) {
    if (!this.canEquip(id) || this.qty(id) <= 0) return false
    const it = ITEMS[id]
    if (it.type === 'tool') {
      const prev = this.s.tools[it.toolType]
      this.removeItem(id, 1)
      if (prev) this.addItem(prev, 1)
      this.s.tools[it.toolType] = id
      return true
    }
    const eq = this.s.equipment
    if (it.stackEquip) { eq.ammo = id; return true }
    if (it.slot === 'weapon' && it.twoHanded && eq.shield) this.unequip('shield')
    if (it.slot === 'shield' && eq.weapon && ITEMS[eq.weapon].twoHanded) this.unequip('weapon')
    const prev = eq[it.slot]
    this.removeItem(id, 1)
    if (prev) this.addItem(prev, 1)
    eq[it.slot] = id
    return true
  },
  unequip(slot) {
    const id = this.s.equipment[slot]
    if (!id) return
    this.s.equipment[slot] = null
    if (!ITEMS[id].stackEquip) this.addItem(id, 1)
  },
  unequipTool(type) {
    const id = this.s.tools[type]
    if (!id) return
    this.s.tools[type] = null
    this.addItem(id, 1)
  },

  /* ================= health, food and potions ================= */
  maxHp() {
    const hp = Math.max(1, Math.round((this.level('hitpoints') + Math.floor(this.mod('maxHp'))) * this.raceHpMult()))
    // A frail life has half the health
    return this.underTrial('frail') ? Math.max(1, Math.floor(hp * FRAIL_HP)) : hp
  },
  heal(n) { this.s.hp = Math.min(this.maxHp(), this.s.hp + n) },
  foodHeal(id) { return Math.floor(ITEMS[id].heal * this.healMult()) },
  eat(id) {
    const it = ITEMS[id]
    if (!it || it.type !== 'food' || this.qty(id) <= 0 || this.s.hp >= this.maxHp()) return false
    // A fasting life eats nothing
    if (this.underTrial('fasting')) return false
    this.removeItem(id, 1)
    this.heal(this.foodHeal(id))
    if (this.tracker) this.tracker.eaten++
    return true
  },
  drink(id) {
    const it = ITEMS[id]
    if (!it || it.type !== 'potion' || this.qty(id) <= 0) return false
    this.removeItem(id, 1)
    if (it.elixir) this.s.buffs.elixir += ELIXIR_DURATION
    else this.s.buffs.potion = { id, t: POTION_DURATION }
    return true
  },
  boost(skill) {
    const p = this.s.buffs.potion
    if (!p || p.t <= 0) return 0
    const b = ITEMS[p.id]?.buff?.[skill]
    return b ? b[0] + Math.floor(this.level(skill) * b[1]) : 0
  },
  boosted(skill) { return this.level(skill) + this.boost(skill) },
  autoEat() {
    if (!this.s.food) return
    while (this.s.hp <= this.maxHp() * this.s.autoEatPct / 100) {
      // When the chosen food runs out, the hero moves on to the best food left in the bag
      if (this.qty(this.s.food) <= 0) {
        const next = this.bestFood()
        if (!next) return
        this.s.food = next
        this.toast(ITEMS[next].icon, 'msg.foodSwitched', { item: '@item:' + next }, 'info')
      }
      if (!this.eat(this.s.food)) break
    }
  },
  bestFood() {
    let best = null
    for (const id in this.s.inventory) if (ITEMS[id]?.type === 'food' && this.s.inventory[id] > 0 && (!best || ITEMS[id].heal > ITEMS[best].heal)) best = id
    return best
  },
  autoDrink() {
    const id = this.s.potion
    const p = this.s.buffs.potion
    if (id && (!p || p.t <= 0) && this.qty(id) > 0) this.drink(id)
  },
}
