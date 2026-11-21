import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative, sep } from 'node:path'

// Every package the source imports, bundled once when the dev server starts. Found later (on opening a
// screen for the first time) they would be bundled again under new names, and a page already open would
// end up with two copies of Vue Router or PrimeVue and blank screens
function sourceDeps(dir = 'src', found = new Set()) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${e.name}`
    if (e.isDirectory()) sourceDeps(path, found)
    else if (/\.(js|vue)$/.test(e.name)) for (const [, dep] of readFileSync(path, 'utf8').matchAll(/from '((?:@[\w-]+\/)?[a-z][\w-]*(?:\/[\w-]+)*)'/g)) found.add(dep)
  }
  return [...found]
}

// Lists every file of the build in the service worker, so the whole game is stored on the first visit
// and plays offline even on screens never opened. The cache is named after the files, so each release
// gets a fresh one and the old one is dropped
function precacheAll() {
  let outDir = 'dist'
  return {
    name: 'precache-all',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir },
    closeBundle() {
      const sw = join(outDir, 'sw.js')
      if (!existsSync(sw)) return
      const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
      const files = walk(outDir).map(f => relative(outDir, f).split(sep).join('/')).filter(f => f !== 'sw.js' && f !== 'index.html').sort()
      const version = createHash('sha1').update(files.join('|')).digest('hex').slice(0, 10)
      const src = readFileSync(sw, 'utf8')
        .replace("const CACHE = 'aetheria'", `const CACHE = 'aetheria-${version}'`)
        .replace('const FILES = []', `const FILES = ${JSON.stringify(files.map(f => './' + f))}`)
      writeFileSync(sw, src)
    },
  }
}

// `npm run build`        -> dist/ (regular deploy with chunks)
// `npm run build:single` -> dist-single/index.html (one self-contained file)
// Published builds must seal saves with the real key (a repository secret); without it they would use
// the development key, which is public, so the build stops instead
if (process.env.REQUIRE_SAVE_KEY && !process.env.VITE_SAVE_KEY) throw new Error('VITE_SAVE_KEY is missing: set the SAVE_KEY repository secret')

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [vue(), ...(mode === 'single' ? [viteSingleFile()] : [precacheAll()])],
  optimizeDeps: { include: sourceDeps() },
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 2000,
    // Keep the game code in its own long-lived chunk
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // The icons rarely change: their own chunk stays cached across game updates
            { name: 'icons', test: /src[\\/]game[\\/]icons\.json/, priority: 1 },
            { name: 'game', test: /src[\\/](game|i18n[\\/](index|bind|mods|names))/ },
          ],
        },
      },
    },
  },
}))
