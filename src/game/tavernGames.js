/* =========================================================
   TAVERN GAMES — the King's Twenty-One against the keeper, darts, knucklebone, arm wrestling, a
   drinking contest, three men's morris and the rune shell game, all played for gold up to the
   tavern's betting limit. Rounds in play are kept in the save. Games of skill (darts, arm wrestling,
   the drinking contest, the runes) are played on the screen, which reports how the hero did.
   Mixed into G (engine.js); `this` is the engine.
   ========================================================= */
import {
  CARD_RANKS, CARD_SUITS, BLACKJACK, KEEPER_STANDS, NATURAL_PAYS, DART_RINGS, DART_THROWS, DART_PAYS, TABA_FACES, ARM_RIVALS, ARM_FORM,
  RECENT_KEPT, BEER_ROUNDS, beerRivalFails, MORRIS_LINES, MORRIS_LINKS, MORRIS_MAX_MOVES, MORRIS_PAYS, RUNE_SWAPS, RUNE_PAYS,
  SHOE_THROWS, SHOE_RINGS, SHOE_PAYS, BARD_VERSES, BARD_ROUNDS, BARD_SCORES, BARD_ROAR, BARD_RIVAL, BARD_PAYS,
} from './data/tavern.js'

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
const sum = a => a.reduce((s, v) => s + v, 0)
const freshDeck = () => shuffle(CARD_SUITS.flatMap(s => CARD_RANKS.map(r => ({ r, s }))))
// A hand's value: aces count 11 unless that would go over 21
export function handValue(cards) {
  let v = 0, aces = 0
  for (const c of cards) {
    if (c.r === 'A') { v += 11; aces++ } else v += ['J', 'Q', 'K'].includes(c.r) ? 10 : +c.r
  }
  while (v > BLACKJACK && aces--) v -= 10
  return v
}
// Three men's morris: who holds a line, and every move a side can make (a place while placing, a step after)
const morrisWinner = b => { for (const [x, y, z] of MORRIS_LINES) if (b[x] && b[x] === b[y] && b[x] === b[z]) return b[x]; return null }
function morrisMoves(b, side, placed) {
  const out = []
  if (placed[side] < 3) {
    for (let i = 0; i < 9; i++) if (!b[i] && !(i === 4 && b.every(v => !v))) out.push([null, i])
  } else {
    for (let i = 0; i < 9; i++) if (b[i] === side) for (const j of MORRIS_LINKS[i]) if (!b[j]) out.push([i, j])
  }
  return out
}
function morrisApply(b, placed, side, [from, to]) {
  const nb = [...b]
  if (from !== null) nb[from] = null
  nb[to] = side
  return { b: nb, placed: from === null ? { ...placed, [side]: placed[side] + 1 } : placed }
}
// Looks a few moves ahead: the keeper wins as soon as it can and stops the hero from winning
function morrisScore(b, placed, side, depth) {
  const w = morrisWinner(b)
  if (w) return w === 'keeper' ? 10 + depth : -10 - depth
  if (!depth) return 0
  const moves = morrisMoves(b, side, placed)
  if (!moves.length) return 0
  const next = side === 'keeper' ? 'you' : 'keeper'
  const scores = moves.map(m => { const r = morrisApply(b, placed, side, m); return morrisScore(r.b, r.placed, next, depth - 1) })
  return side === 'keeper' ? Math.max(...scores) : Math.min(...scores)
}
const pickOne = a => a[Math.floor(Math.random() * a.length)]
const natural = cards => cards.length === 2 && handValue(cards) === BLACKJACK

export const tavernGames = {
  tavernGames() {
    const tv = this.s.tavern
    const g = (tv.games ||= { cards: { played: 0, won: 0, net: 0, round: null }, darts: { played: 0, best: 0, net: 0, round: null } })
    // Saves from when the card game was Seven Crowns: its record carries over, and a hand left open gives its bet back
    if (g.crowns) {
      if (g.crowns.round && !g.crowns.round.result) this.s.gold += g.crowns.round.bet
      g.cards = { played: g.crowns.played, won: g.crowns.won, net: g.crowns.net, round: null }
      delete g.crowns
    }
    return g
  },
  // A bet the table takes: at least 10 gold, at most the tavern's limit and the hero's purse
  takeBet(bet) {
    bet = Math.floor(bet)
    if (!(bet >= 10) || bet > this.maxBet()) return 0
    this.s.gold -= bet
    return bet
  },
  payOut(game, bet, back) {
    if (back > 0) this.s.gold += back
    const net = back - bet
    if (net > 0) this.s.stats.goldEarned += net
    game.net += net
    game.played++
    game.recent = [net, ...(game.recent || [])].slice(0, RECENT_KEPT)
    if (net > 0) game.won = (game.won || 0) + 1
    this.rollPet(src => src.dice)
    return net
  },

  /* ---------- blackjack ---------- */
  // Two cards each, the keeper's second face down; a natural blackjack settles at once
  cardsStart(bet) {
    const g = this.tavernGames().cards
    if (g.round) return null
    const b = this.takeBet(bet)
    if (!b) return null
    const deck = freshDeck()
    g.round = { id: Date.now(), bet: b, deck, you: [deck.pop(), deck.pop()], keeper: [deck.pop(), deck.pop()], doubled: false, result: null }
    if (natural(g.round.you) || natural(g.round.keeper)) this.cardsSettle()
    return g.round
  },
  cardsHit() {
    const r = this.tavernGames().cards.round
    if (!r || r.result) return null
    r.you.push(r.deck.pop())
    if (handValue(r.you) >= BLACKJACK) return this.cardsStand()
    return r
  },
  cardsStand() {
    const r = this.tavernGames().cards.round
    if (!r || r.result) return null
    if (handValue(r.you) <= BLACKJACK) while (handValue(r.keeper) < KEEPER_STANDS) r.keeper.push(r.deck.pop())
    return this.cardsSettle()
  },
  // Double the bet for exactly one more card, then stand
  canDouble() { const r = this.tavernGames().cards.round; return !!r && !r.result && r.you.length === 2 && this.s.gold >= r.bet },
  cardsDouble() {
    const r = this.tavernGames().cards.round
    if (!this.canDouble()) return null
    this.s.gold -= r.bet
    r.bet *= 2
    r.doubled = true
    r.you.push(r.deck.pop())
    return this.cardsStand()
  },
  cardsSettle() {
    const g = this.tavernGames().cards, r = g.round
    const you = handValue(r.you), keeper = handValue(r.keeper)
    let kind
    if (natural(r.you) && natural(r.keeper)) kind = 'push'
    else if (natural(r.you)) kind = 'natural'
    else if (natural(r.keeper)) kind = 'keeperNatural'
    else if (you > BLACKJACK) kind = 'bust'
    else if (keeper > BLACKJACK) kind = 'keeperBust'
    else kind = you > keeper ? 'win' : you === keeper ? 'push' : 'lose'
    const back = kind === 'natural' ? Math.floor(r.bet * (1 + NATURAL_PAYS)) : ['win', 'keeperBust'].includes(kind) ? r.bet * 2 : kind === 'push' ? r.bet : 0
    r.result = { kind, net: this.payOut(g, r.bet, back) }
    return r
  },
  cardsClear() { const g = this.tavernGames().cards; if (g.round?.result) g.round = null },

  /* ---------- darts ---------- */
  // How steady the hero's hand is, from 0 to 1: ranged training calms the aim
  dartsSteady() { return Math.min(1, this.level('ranged') / 99) },
  dartsStart(bet) {
    const g = this.tavernGames().darts
    if (g.round) return null
    const b = this.takeBet(bet)
    if (!b) return null
    g.round = { bet: b, throws: [], result: null }
    return g.round
  },
  // dist: how far from the centre the dart landed, as a share of the board's radius
  dartsThrow(dist) {
    const g = this.tavernGames().darts, r = g.round
    if (!r || r.result || r.throws.length >= DART_THROWS) return null
    const ring = DART_RINGS.find(x => dist <= x.r)
    r.throws.push(ring ? ring.pts : 0)
    if (r.throws.length >= DART_THROWS) {
      const total = sum(r.throws)
      g.best = Math.max(g.best, total)
      const pay = DART_PAYS.find(p => total >= p.min)
      r.result = { total, mult: pay?.mult || 0, net: this.payOut(g, r.bet, Math.floor(r.bet * (pay?.mult || 0))) }
    }
    return r
  },
  dartsClear() { const g = this.tavernGames().darts; if (g.round?.result) g.round = null },

  /* ---------- the other tables share one kind of record ---------- */
  table(id) { const g = this.tavernGames(); return (g[id] ||= { played: 0, won: 0, net: 0, round: null }) },
  tableOpen(id) { const r = this.table(id).round; return !!r && !r.result },
  tableClear(id) { const t = this.table(id); if (t.round?.result) t.round = null },
  tableStart(id, bet, round) {
    if (this.tableOpen(id)) return null
    const b = this.takeBet(bet)
    if (!b) return null
    return (this.table(id).round = { bet: b, result: null, ...round })
  },
  settleTable(id, kind, back) {
    const t = this.table(id), r = t.round
    r.result = { kind, net: this.payOut(t, r.bet, Math.floor(back)) }
    return r
  },

  /* ---------- knucklebone: one throw ---------- */
  tabaThrow(bet) {
    let x = Math.random(), face = TABA_FACES[TABA_FACES.length - 1]
    for (const f of TABA_FACES) { if (x < f.p) { face = f; break } x -= f.p }
    const r = this.tableStart('taba', bet, { face: face.id })
    return r && this.settleTable('taba', face.id, r.bet * face.mult)
  },

  /* ---------- arm wrestling ---------- */
  // The highest rung of the ladder open to the hero: the one after the strongest rival beaten
  armTop() {
    const t = this.table('arm')
    const beaten = ARM_RIVALS.reduce((top, r, i) => (t.beaten?.[r.id] ? i + 1 : top), 0)
    return Math.min(ARM_RIVALS.length - 1, beaten)
  },
  // The most a rival wrestles for: the weaker ones only for a share of the tavern's limit
  armMaxBet(rival) {
    const r = ARM_RIVALS.find(x => x.id === rival)
    return r ? Math.max(10, Math.min(this.maxBet(), Math.floor(this.tavernInfo().maxBet * r.share))) : 0
  },
  armStart(bet, rival) {
    const i = ARM_RIVALS.findIndex(r => r.id === rival)
    if (i < 0 || i > this.armTop() || bet > this.armMaxBet(rival)) return null
    const form = +(ARM_FORM[0] + Math.random() * (ARM_FORM[1] - ARM_FORM[0])).toFixed(3)
    return this.tableStart('arm', bet, { rival, form })
  },
  // How far each press moves the arms towards the hero's side: more with Strength
  armPush() { return 0.035 + 0.045 * Math.min(1, this.level('strength') / 99) },
  armEnd(won) {
    if (!this.tableOpen('arm')) return null
    const t = this.table('arm'), r = t.round, rival = ARM_RIVALS.find(x => x.id === r.rival)
    if (won) t.beaten = { ...(t.beaten || {}), [r.rival]: (t.beaten?.[r.rival] || 0) + 1 }
    return this.settleTable('arm', won ? 'win' : 'lose', won ? r.bet * rival.mult : 0)
  },

  /* ---------- drinking contest ---------- */
  beerStart(bet) { return this.tableStart('beer', bet, { n: 0 }) },
  // Half the width of the steady zone (a share of the sway): wider with Hitpoints, narrower each tankard
  beerZone(n) { return Math.max(0.06, (0.2 + 0.14 * Math.min(1, this.level('hitpoints') / 99)) * (1 - 0.06 * n)) },
  // steady: whether the hero drank while the tankard was steady
  beerDrink(steady) {
    if (!this.tableOpen('beer')) return null
    const t = this.table('beer'), r = t.round
    if (!steady) return this.settleTable('beer', 'spill', 0)
    r.n++
    t.best = Math.max(t.best || 0, r.n)
    if (Math.random() < beerRivalFails(r.n)) return this.settleTable('beer', 'win', r.bet * 2)
    if (r.n >= BEER_ROUNDS) return this.settleTable('beer', 'tie', r.bet)
    return r
  },

  /* ---------- three men's morris ---------- */
  morrisStart(bet) { return this.tableStart('morris', bet, { board: Array(9).fill(null), placed: { you: 0, keeper: 0 }, moves: 0, last: null }) },
  morrisTargets(from) {
    const r = this.table('morris').round
    if (!r || r.result) return []
    return morrisMoves(r.board, 'you', r.placed).filter(([a]) => a === from).map(([, b]) => b)
  },
  // The hero's move (from null while placing), then the keeper's answer
  morrisPlay(from, to) {
    if (!this.morrisTargets(from).includes(to)) return null
    const r = this.table('morris').round
    const mine = morrisApply(r.board, r.placed, 'you', [from, to])
    r.board = mine.b
    r.placed = mine.placed
    r.moves++
    if (morrisWinner(r.board)) return this.settleTable('morris', 'win', r.bet * MORRIS_PAYS)
    const moves = morrisMoves(r.board, 'keeper', r.placed)
    if (moves.length) {
      // Now and then the keeper's mind wanders; otherwise it plays the best move it sees
      const scored = moves.map(m => { const n = morrisApply(r.board, r.placed, 'keeper', m); return { m, v: morrisScore(n.b, n.placed, 'you', 4) } })
      const best = Math.max(...scored.map(x => x.v))
      const pick = Math.random() < 0.15 ? pickOne(scored) : pickOne(scored.filter(x => x.v === best))
      const theirs = morrisApply(r.board, r.placed, 'keeper', pick.m)
      r.board = theirs.b
      r.placed = theirs.placed
      r.last = pick.m
    }
    if (morrisWinner(r.board)) return this.settleTable('morris', 'lose', 0)
    if (r.moves >= MORRIS_MAX_MOVES) return this.settleTable('morris', 'draw', r.bet)
    return r
  },

  /* ---------- the rune shell game ---------- */
  // Seconds each swap takes: slower with Runecrafting
  runeSwapTime() { return 0.42 + 0.28 * Math.min(1, this.level('runecrafting') / 99) },
  runesStart(bet) {
    const swaps = Array.from({ length: RUNE_SWAPS }, () => { const a = Math.floor(Math.random() * 3); return [a, (a + 1 + Math.floor(Math.random() * 2)) % 3] })
    return this.tableStart('runes', bet, { marked: Math.floor(Math.random() * 3), swaps, picked: null })
  },
  // Where the marked stone ends up after the swaps
  runesEnd(r) { let at = r.marked; for (const [a, b] of r.swaps) at = at === a ? b : at === b ? a : at; return at },
  runesPick(i) {
    if (!this.tableOpen('runes')) return null
    const r = this.table('runes').round
    r.picked = i
    const won = i === this.runesEnd(r)
    return this.settleTable('runes', won ? 'win' : 'lose', won ? r.bet * RUNE_PAYS : 0)
  },

  /* ---------- horseshoes ---------- */
  // How fast the two gauges sweep, in sweeps a second: calmer with Agility
  shoesPace() { return 1 - 0.35 * Math.min(1, this.level('agility') / 99) },
  shoesStart(bet) { return this.tableStart('shoes', bet, { throws: [] }) },
  // power, line: how far off each step was, from -1 to 1 (0 is true). Returns where the shoe fell
  shoesThrow(power, line) {
    if (!this.tableOpen('shoes')) return null
    const t = this.table('shoes'), r = t.round
    if (r.throws.length >= SHOE_THROWS) return null
    // A shoe never lands quite where it was meant to
    const wobble = (Math.random() - 0.5) * 0.05
    const x = line * 0.45 + wobble, y = power * 0.45 + (Math.random() - 0.5) * 0.05
    const d = Math.hypot(x, y)
    const ring = SHOE_RINGS.find(g => d <= g.r)
    const shot = { x: +x.toFixed(3), y: +y.toFixed(3), kind: ring?.id || 'miss', pts: ring?.pts || 0 }
    r.throws.push(shot)
    if (r.throws.length >= SHOE_THROWS) {
      const total = sum(r.throws.map(x => x.pts))
      t.best = Math.max(t.best || 0, total)
      const pay = SHOE_PAYS.find(p => total >= p.min)
      this.settleTable('shoes', pay ? (pay.mult > 1 ? 'win' : 'even') : 'lose', r.bet * (pay?.mult || 0))
      r.result.total = total
    }
    return shot
  },

  /* ---------- bards' duel ---------- */
  bardsStart(bet) {
    const verses = shuffle([...BARD_VERSES]).slice(0, BARD_ROUNDS)
    // The three answers of every verse in their own order
    const order = verses.map(() => shuffle(['good', 'flat', 'off']))
    return this.tableStart('bards', bet, { verses, order, you: [], rival: [] })
  },
  // pick: which of the three answers (by position), or -1 when time ran out
  bardsAnswer(pick) {
    if (!this.tableOpen('bards')) return null
    const r = this.table('bards').round
    const i = r.you.length
    const kind = r.order[i][pick] || 'off'
    const roar = kind === 'good' && Math.random() < BARD_ROAR
    r.you.push({ kind, pts: BARD_SCORES[kind] + (roar ? 1 : 0), roar })
    let x = Math.random(), pts = 3
    for (let k = 0; k < BARD_RIVAL.length; k++) { if (x < BARD_RIVAL[k]) { pts = k + 1; break } x -= BARD_RIVAL[k] }
    r.rival.push(pts)
    if (r.you.length >= BARD_ROUNDS) {
      const you = sum(r.you.map(x => x.pts)), rival = sum(r.rival)
      this.settleTable('bards', you > rival ? 'win' : you === rival ? 'tie' : 'lose', you > rival ? r.bet * BARD_PAYS : you === rival ? r.bet : 0)
      Object.assign(r.result, { you, rival })
    }
    return r
  },
}
