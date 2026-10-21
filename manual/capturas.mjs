// Capturas del manual de usuario de App Campo.
// Requiere el servidor de ejemplo corriendo (node manual/servidor_manual.mjs → app en :5190):
// todos los predios y dueños que aparecen son INVENTADOS.
// Usa el Chrome instalado (puppeteer-core, sin descargar Chromium).
import puppeteer from 'puppeteer-core'
import { setTimeout as sleep } from 'node:timers/promises'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { FINCA_1, FINCA_2 } from './centro.mjs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = 'http://localhost:5190'
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'img')
const gps = (f, dLat = 0, dLon = 0) => page.setGeolocation({ latitude: f.lat + dLat, longitude: f.lon + dLon, accuracy: 6 })
mkdirSync(OUT, { recursive: true })
const log = (...a) => console.log('[capturas]', ...a)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--lang=es-CO'] })
await browser.defaultBrowserContext().overridePermissions(BASE, ['geolocation'])
const page = await browser.newPage()
await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36')
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: false })
await gps(FINCA_1, 0.0002, 0.0001)   // al lado de la Zona 1 de «La Esperanza»
page.on('dialog', d => d.accept())   // «¿Descartar…?» y similares

const shot = async (nombre) => { await sleep(500); await page.screenshot({ path: path.join(OUT, `${nombre}.jpg`), type: 'jpeg', quality: 84 }); log('guardada', nombre) }
const esperaTexto = (t, ms = 15000) => page.waitForFunction(x => document.body.innerText.includes(x), { timeout: ms }, t)
async function clic(texto, { selector = 'button, a, [role=tab]', exacto = false } = {}) {
  const ok = await page.evaluate((texto, selector, exacto) => {
    const el = [...document.querySelectorAll(selector)].find(e => {
      const t = (e.innerText || e.getAttribute('aria-label') || '').trim()
      return exacto ? t === texto : t.includes(texto)
    })
    if (!el) return false
    el.scrollIntoView({ block: 'center' }); el.click(); return true
  }, texto, selector, exacto)
  if (!ok) throw new Error(`No encontré «${texto}»`)
  await sleep(700)
}
const clicAria = async (aria) => { await page.click(`[aria-label="${aria}"]`); await sleep(700) }
async function esperaMapa() {
  await page.waitForSelector('.leaflet-tile-loaded', { timeout: 30000 }).catch(() => {})
  await sleep(3000)
}
const arriba = () => page.evaluate(() => window.scrollTo(0, 0))

// ── 1. Primera vez: el nombre ───────────────────────────────────────────────
await page.goto(BASE, { waitUntil: 'networkidle2' })
await page.evaluate(async () => {
  localStorage.clear()
  await new Promise(r => { const q = indexedDB.deleteDatabase('AECampoDB'); q.onsuccess = q.onerror = q.onblocked = r })
})
await page.reload({ waitUntil: 'networkidle2' })
await esperaTexto('Cuál es tu nombre')
await page.type('input[placeholder="Tu nombre completo"]', 'Técnica de ejemplo')
await shot('01-nombre')
await clic('Continuar', { exacto: true })
await esperaTexto('Confirma tu nombre')
await shot('02-confirmar-nombre')
await clic('Sí, este es mi nombre')

// ── 2. Inicio ───────────────────────────────────────────────────────────────
await esperaTexto('Mis registros')
await sleep(1500)
await shot('03-inicio')
await page.evaluate(() => localStorage.setItem('ae_install_dismissed', '1'))
await page.reload({ waitUntil: 'networkidle2' })
await esperaTexto('Mis registros')

// ── 3. Lista de predios ─────────────────────────────────────────────────────
await clic('Predios', { exacto: true })
await esperaTexto('La Esperanza')
await sleep(1500)
await shot('04-predios')

// ── 4. Predio con propuesta del SIG ─────────────────────────────────────────
await clic('La Esperanza')
await esperaTexto('EN ESTA VISITA')
await shot('05-predio')
await clic('Módulo SIG')
await esperaMapa()
await shot('06-sig-sitios')
await clic('Zona 1', { exacto: false })
await sleep(800)
await shot('07-sig-zona')
await clic('Corregir límite')
await sleep(1200)
await shot('08-sig-corregir')
await clic('Cancelar')
await clicAria('Cerrar').catch(() => {})
await clic('Límite del predio')
await sleep(1200)
await shot('09-sig-limite')

// ── 5. Predio «campo primero» con capa de apoyo ─────────────────────────────
await page.goto(BASE + '/familia/nueva', { waitUntil: 'networkidle2' })
await esperaTexto('El Porvenir')
await gps(FINCA_2, -0.0003, 0.0002)   // parada dentro de «El Porvenir»
await clic('El Porvenir')
await esperaTexto('EN ESTA VISITA')
await shot('10-predio-campo-primero')
await clic('Módulo SIG')
await esperaMapa()
await shot('11-campo-primero-mapa')
// dibujar un sitio sobre la capa de apoyo
await clicAria('Dibujar un sitio nuevo')
const mapa = await page.$('.leaflet-container')
const caja = await mapa.boundingBox()
const cx = caja.x + caja.width / 2, cy = caja.y + caja.height * 0.42
const vertices = [[-55, -40], [35, -55], [60, 20], [-10, 55], [-60, 15]]
for (const [dx, dy] of vertices) { await page.mouse.click(cx + dx, cy + dy); await sleep(350) }
await sleep(400)
await shot('12-dibujando')
await page.mouse.click(cx + vertices[0][0], cy + vertices[0][1])
await sleep(1500)
await shot('13-sitio-dibujado')
// trazar caminando
await clicAria('Trazar caminando con el GPS')
await sleep(1000)
await clic('Marcar punto')
await sleep(600)
await shot('14-trazar-caminando')
await clicAria('Cancelar')

// ── 6. Formularios ──────────────────────────────────────────────────────────
await clicAria('Volver')
await esperaTexto('EN ESTA VISITA')
await arriba()
await clic('Evaluación de Campo')
await sleep(2000)
await shot('15-evaluacion')
await page.goBack({ waitUntil: 'networkidle2' })
await esperaTexto('EN ESTA VISITA')
await clic('Encuesta Predial')
await sleep(2000)
await shot('16-encuesta')

// ── 7. Sincronizar ──────────────────────────────────────────────────────────
await page.goto(BASE + '/', { waitUntil: 'networkidle2' })
await esperaTexto('Mis registros')
await sleep(1200)
await shot('17-mis-registros')

// ── 8. Práctica ─────────────────────────────────────────────────────────────
// La práctica se arma alrededor del primer GPS que recibe: el de la persona.
await gps(FINCA_1, 0.0003, -0.0002)
await clic('Práctica 1')
await esperaTexto('Predio de práctica')
await shot('18-practica')
await clic('Módulo SIG')
await esperaMapa()
await sleep(1500)
await shot('19-practica-sig')
await page.goto(BASE + '/', { waitUntil: 'networkidle2' })
await esperaTexto('Mis registros')
await clic('Práctica 2')
await esperaTexto('Predio de práctica')
await clic('Módulo SIG')
await esperaMapa()
await sleep(1500)
await shot('20-practica-campo-primero')

// ── 9. Sin señal ────────────────────────────────────────────────────────────
await page.goto(BASE + '/', { waitUntil: 'networkidle2' })
await esperaTexto('Mis registros')
await page.setOfflineMode(true)
await sleep(1500)
await shot('21-sin-senal')
await page.setOfflineMode(false)

await browser.close()
log('listo')
