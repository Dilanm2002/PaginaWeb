// scripts/build.js — Minifica CSS y JS para producción
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import CleanCSS from 'clean-css'
import { minify } from 'terser'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root      = resolve(__dirname, '..')
const dist      = resolve(root, 'dist')

mkdirSync(dist + '/js',     { recursive: true })
mkdirSync(dist + '/assets', { recursive: true })

// ── Minificar CSS ──────────────────────────────────────────────
const css    = readFileSync(resolve(root, 'assets/styles.css'), 'utf-8')
const minCss = new CleanCSS({ level: 2 }).minify(css)
writeFileSync(resolve(dist, 'assets/styles.css'), minCss.output)
console.log(`CSS: ${(css.length / 1024).toFixed(1)} KiB → ${(minCss.output.length / 1024).toFixed(1)} KiB`)

// ── Minificar JS ───────────────────────────────────────────────
const jsFiles = [
  'autenticacion.js', 'logica-carrito.js', 'carrito.js',
  'vista.js', 'aplicacion.js', 'vista-cajero.js',
  'vista-admin.js', 'vista-menu.js'
]

for (const file of jsFiles) {
  const src    = readFileSync(resolve(root, 'js', file), 'utf-8')
  const result = await minify(src, { compress: true, mangle: true })
  writeFileSync(resolve(dist, 'js', file), result.code)
  console.log(`JS ${file}: ${(src.length / 1024).toFixed(1)} KiB → ${(result.code.length / 1024).toFixed(1)} KiB`)
}

console.log('\n✓ Build completo en /dist')
