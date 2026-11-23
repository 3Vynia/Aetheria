/* Scrolling without scrollbars. The bars are hidden everywhere (main.css); what scrolls up and down
   needs nothing more, and the rows that scroll sideways get:
   - a soft fade on the side where there is more to see,
   - the mouse wheel moving them sideways while the pointer is over them,
   - dragging with the mouse, like a finger on a phone. */
const ROWS = '.chips, .chips-row, .cards, .tb-filters, .group-row, .set-nav, .grids, .p-tablist-tab-list, [data-side-scroll]'
const EDGE = 4

const sideways = el => el.scrollWidth - el.clientWidth > EDGE && getComputedStyle(el).overflowX !== 'hidden' && getComputedStyle(el).overflowX !== 'visible'
const rowOf = target => {
  for (let el = target; el && el !== document.body; el = el.parentElement) if (el.matches?.(ROWS) && sideways(el)) return el
  return null
}

function fade(el) {
  const max = el.scrollWidth - el.clientWidth
  if (max <= EDGE) { if (el.dataset.fade) delete el.dataset.fade; return }
  // In right-to-left pages scrollLeft runs from 0 to minus the width
  const at = Math.abs(el.scrollLeft)
  const start = at > EDGE, end = at < max - EDGE
  const v = start && end ? 'both' : start ? 'start' : end ? 'end' : ''
  if ((el.dataset.fade || '') !== v) { if (v) el.dataset.fade = v; else delete el.dataset.fade }
}

// Checked again whenever the page changes, at most a few times a second
let pending = 0
function scan() {
  pending = 0
  for (const el of document.querySelectorAll(ROWS)) fade(el)
}
const soon = () => { pending ||= setTimeout(scan, 250) }

function onWheel(e) {
  if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
  const el = rowOf(e.target)
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  const at = Math.abs(el.scrollLeft)
  // At either end the page goes on scrolling as usual
  if ((e.deltaY < 0 && at <= 0) || (e.deltaY > 0 && at >= max - 1)) return
  e.preventDefault()
  el.scrollLeft += (getComputedStyle(el).direction === 'rtl' ? -1 : 1) * e.deltaY * (e.deltaMode === 1 ? 32 : 1)
}

// Dragging with the mouse; a drag does not count as a click on what it started on
let drag = null
function onDown(e) {
  if (e.pointerType !== 'mouse' || e.button !== 0) return
  const el = rowOf(e.target)
  if (el) drag = { el, x: e.clientX, left: el.scrollLeft, moved: false }
}
function onMove(e) {
  if (!drag) return
  const dx = e.clientX - drag.x
  if (!drag.moved && Math.abs(dx) < 6) return
  drag.moved = true
  drag.el.classList.add('dragging')
  drag.el.scrollLeft = drag.left - dx
}
function onUp() {
  if (!drag) return
  const { el, moved } = drag
  drag = null
  el.classList.remove('dragging')
  if (!moved) return
  const eat = e => { e.preventDefault(); e.stopPropagation() }
  window.addEventListener('click', eat, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 0)
}

export function installSideScroll() {
  if (typeof window === 'undefined') return
  document.addEventListener('scroll', e => { if (e.target?.matches?.(ROWS)) fade(e.target) }, { capture: true, passive: true })
  document.addEventListener('wheel', onWheel, { passive: false })
  document.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  window.addEventListener('resize', soon)
  new MutationObserver(soon).observe(document.body, { childList: true, subtree: true })
  soon()
}
