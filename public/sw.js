// Offline support. Every file of the game is stored when the worker installs (the build fills FILES
// and names the cache after them), so it plays offline from the first visit, on every screen and in
// either language. The page itself is fetched network-first so a new release shows up on the next
// visit; fonts are stored the first time they load.
const CACHE = 'aetheria'
const FILES = []
const SHELL = ['./', './index.html']
// The fonts' stylesheet, as index.html asks for it; the font files it names are stored with it
const FONTS = 'https://fonts.googleapis.com/css2?family=Marcellus+SC&family=Alegreya+Sans:wght@400;500;700;800&display=swap'

async function storeFonts(cache) {
  const css = await fetch(FONTS, { mode: 'cors' })
  if (!css.ok) return
  await cache.put(FONTS, css.clone())
  const urls = [...(await css.text()).matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1])
  await Promise.all(urls.map(u => cache.add(new Request(u, { mode: 'cors' })).catch(() => {})))
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // One file that fails to download must not leave the rest unstored
      .then(cache => Promise.all([...[...SHELL, ...FILES].map(f => cache.add(f).catch(() => {})), storeFonts(cache).catch(() => {})]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('aetheria') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const isFont = url => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin && !isFont(url)) return

  // The page, and the game asking whether a new release is out (see updates.js), always try the network first
  if (request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(request)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return res })
        .catch(() => caches.match('./index.html')),
    )
    return
  }

  event.respondWith(
    // Module scripts are requested with an Origin header the stored copies were not, so Vary is ignored
    caches.match(request, { ignoreSearch: true, ignoreVary: true }).then(hit => hit || fetch(request).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(request, copy)) }
      return res
    })),
  )
})
