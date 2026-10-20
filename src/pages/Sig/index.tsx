import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import {
  ArrowLeft, Crosshair, Plus, Check, X, Pencil, Trash2, Undo2,
  Satellite, AlertTriangle, RefreshCw, MapPin, Footprints, Fence, Sprout,
} from 'lucide-react'
import { db } from '../../db/schema'
import type { FamiliaRecord } from '../../types/familia'
import type { RevisionRecord, CambiosRevision, TipoRevision } from '../../types/revision'
import { newRevision, fusionarRevision } from '../../types/revision'
import {
  zonasVigentes, limitesVigentes, parseGeom, areaHa, posicionRespectoZonas,
  centroZonas, distanciaTexto, type ZonaVigente, type LimiteVigente,
} from '../../lib/geo'
import { generarZonasPractica } from '../../lib/practica'
import { useOnlineStatus } from '../../lib/useOnlineStatus'

// ─── Estilos por estado de la zona ────────────────────────────────────────────
// Colores del satelital: los mismos que pinta la intranet (lib/colores-campo.ts
// allá). No pasan por la paleta de marca a propósito: tienen que leerse sobre
// la imagen.
const ESTILO_FINCA: L.PathOptions = { color: '#ffffff', weight: 2, dashArray: '6 4', fill: false, interactive: false }
// Sombra del polígono tal como estaba justo antes de la corrección en curso
const ESTILO_FANTASMA: L.PathOptions = {
  color: '#6b7280', weight: 2, dashArray: '3 5',
  fillColor: '#6b7280', fillOpacity: 0.25, interactive: false,
}
// Mientras se trabaja el límite, los sitios se ven pero no estorban
const ESTILO_SITIO_TENUE: L.PathOptions = { color: '#f59e0b', weight: 1.5, fillOpacity: 0.08, dashArray: '2 4', interactive: false }

function colorRevision(rev: RevisionRecord | null, descartada = false, retirada = false): string {
  if (retirada)                           return '#9ca3af'   // ya no existe en el SIG
  if (descartada)                         return '#ef4444'
  if (rev?.accion === 'confirmada')       return '#10b981'
  if (rev?.accion === 'modificada')       return '#3b82f6'
  if (rev?.accion === 'nueva')            return '#14b8a6'
  return '#f59e0b'                                            // original del SIG (por verificar)
}

function estiloZona(z: ZonaVigente, seleccionada: boolean): L.PathOptions {
  const color = colorRevision(z.revision, z.descartada, z.retirada_del_sig)
  return {
    color,
    weight: seleccionada ? 5 : 3,
    fillColor: color,
    fillOpacity: z.descartada ? 0.06 : seleccionada ? 0.35 : 0.2,
    dashArray: z.descartada ? '4 6' : undefined,
  }
}

function estiloLimite(l: LimiteVigente, seleccionado: boolean): L.PathOptions {
  // Sin revisión de campo: blanco (es lo que dibujó el SIG). Con revisión: su color.
  const color = l.revision ? colorRevision(l.revision) : '#ffffff'
  return { color, weight: seleccionado ? 5 : 3.5, fillColor: color, fillOpacity: seleccionado ? 0.14 : 0.06 }
}

function etiquetaRevision(z: { revision: RevisionRecord | null; descartada?: boolean; retirada_del_sig?: boolean }): { txt: string; cls: string } {
  if (z.retirada_del_sig)                  return { txt: 'Retirada por el SIG', cls: 'bg-gray-200 text-gray-700' }
  if (z.descartada)                        return { txt: 'Descartada',        cls: 'bg-red-100 text-red-800' }
  if (z.revision?.accion === 'confirmada') return { txt: 'Confirmada',        cls: 'bg-emerald-100 text-emerald-800' }
  if (z.revision?.accion === 'modificada') return { txt: 'Corregida',         cls: 'bg-blue-100 text-blue-800' }
  if (z.revision?.accion === 'nueva')      return { txt: 'Dibujada en campo', cls: 'bg-teal-100 text-teal-800' }
  return { txt: 'Por verificar', cls: 'bg-amber-100 text-amber-800' }
}

type Modo = 'ver' | 'editar' | 'dibujar' | 'gps'
/** Qué se está trabajando: los sitios de siembra o el límite del predio. */
type Capa = 'sitios' | 'limite'

const tipoDeCapa = (c: Capa): TipoRevision => c === 'limite' ? 'finca' : 'restauracion'

// ─── Página ───────────────────────────────────────────────────────────────────
export function SigPage() {
  const { id } = useParams<{ id: string }>()   // familia local_id
  const navigate = useNavigate()
  const online = useOnlineStatus()

  const [familia, setFamilia] = useState<FamiliaRecord | null>(null)
  const [revisiones, setRevisiones] = useState<RevisionRecord[]>([])
  const [loaded, setLoaded] = useState(false)

  const [capa, setCapa] = useState<Capa>('sitios')
  const [selNum, setSelNum] = useState<number | null>(null)     // sitio seleccionado
  const [selLim, setSelLim] = useState<number | null>(null)     // polígono de límite seleccionado
  const [modo, setModo] = useState<Modo>('ver')
  const [obs, setObs] = useState('')
  const [gps, setGps] = useState<{ lat: number; lon: number; accuracy: number } | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [siguiendo, setSiguiendo] = useState(true)
  const [puntosGps, setPuntosGps] = useState<[number, number][]>([])   // [lon, lat]

  const mapRef = useRef<L.Map | null>(null)
  const mapDivRef = useRef<HTMLDivElement | null>(null)
  const zonasLayerRef = useRef<L.LayerGroup | null>(null)
  const fincaLayerRef = useRef<L.LayerGroup | null>(null)
  const trazoLayerRef = useRef<L.LayerGroup | null>(null)
  const capasPorZonaRef = useRef<Map<number, L.Polygon>>(new Map())
  const capasPorLimiteRef = useRef<Map<number, L.Polygon>>(new Map())
  const gpsMarkerRef = useRef<L.CircleMarker | null>(null)
  const gpsCircleRef = useRef<L.Circle | null>(null)
  const editLayerRef = useRef<L.Polygon | null>(null)
  const ghostLayerRef = useRef<L.GeoJSON | null>(null)
  const fittedRef = useRef(false)
  const siguiendoRef = useRef(true)
  const modoRef = useRef<Modo>('ver')
  const capaRef = useRef<Capa>('sitios')
  const familiaRef = useRef<FamiliaRecord | null>(null)
  const anclandoRef = useRef(false)   // evita doble anclaje si llegan 2 fixes de GPS casi juntos
  const capaInicialRef = useRef(false)

  siguiendoRef.current = siguiendo
  modoRef.current = modo
  capaRef.current = capa
  familiaRef.current = familia

  // ─── Cargar datos locales ────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    if (!id) return
    const [f, revs] = await Promise.all([
      db.familias.where('local_id').equals(id).first(),
      db.revisiones.where('familia_local_id').equals(id).toArray(),
    ])
    setFamilia(f ?? null)
    setRevisiones(revs)
    setLoaded(true)
  }, [id])

  useEffect(() => { cargar() }, [cargar])

  const zonas = useMemo(
    () => familia ? zonasVigentes(familia, revisiones) : [],
    [familia, revisiones],
  )
  const limites = useMemo(
    () => familia ? limitesVigentes(familia, revisiones) : [],
    [familia, revisiones],
  )
  const campoPrimero = familia?.flujo_campo === 'campo_primero'
  const zonaSel = capa === 'sitios' ? zonas.find(z => z.zona_numero === selNum) ?? null : null
  const limSel = capa === 'limite' ? limites.find(l => l.numero === selLim) ?? null : null
  const pendientes = revisiones.filter(r => r.sync_status !== 'synced').length

  // Campo primero sin límite todavía: se empieza por el límite del predio.
  useEffect(() => {
    if (!familia || capaInicialRef.current) return
    capaInicialRef.current = true
    if (familia.flujo_campo === 'campo_primero' && limitesVigentes(familia, revisiones).length === 0) setCapa('limite')
  }, [familia, revisiones])

  const posicion = useMemo(() => {
    if (!gps) return null
    return posicionRespectoZonas(gps.lat, gps.lon, zonas.filter(z => !z.descartada))
  }, [gps, zonas])

  // ─── Inicializar mapa (una sola vez) ────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current || !familia) return

    const centro = centroZonas([
      ...familia.zonas_finca.map(f => f.geojson),
      ...familia.zonas_sig.map(z => z.geojson),
    ]) ?? [1.61, -75.61]   // Florencia, Caquetá como último recurso

    const map = L.map(mapDivRef.current, { zoomControl: false, attributionControl: false })
      .setView(centro, 15)

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    fincaLayerRef.current = L.layerGroup().addTo(map)
    zonasLayerRef.current = L.layerGroup().addTo(map)
    trazoLayerRef.current = L.layerGroup().addTo(map)

    // Si el usuario arrastra el mapa, dejar de seguir el GPS
    map.on('dragstart', () => setSiguiendo(false))

    // Dibujo de zona o límite nuevo (geoman): el tipo lo da la capa activa
    map.on('pm:create', (e: { layer: L.Layer }) => {
      const feat = (e.layer as L.Polygon).toGeoJSON()
      map.removeLayer(e.layer)
      map.pm.disableDraw()
      const geomStr = JSON.stringify(feat.geometry)
      guardarNueva(geomStr, 'nueva')
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      // Las capas del GPS eran de este mapa: sin esto el punto azul no vuelve
      // a dibujarse en un mapa nuevo (setLatLng sobre una capa huérfana no pinta).
      gpsMarkerRef.current = null
      gpsCircleRef.current = null
      fittedRef.current = false
    }
    // Depende del predio, no del objeto `familia`: cada guardado lo vuelve a
    // leer de Dexie (objeto nuevo) y con [familia] el mapa se destruía y se
    // creaba otra vez tras cada acción — volvía al zoom 15 y perdía el GPS.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familia?.local_id])

  // ─── Pintar capas cada vez que cambian las zonas o el límite ───────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !familia || modo === 'editar') return   // no repintar en plena edición

    // Límite del predio: contexto en la capa de sitios, seleccionable en la suya
    fincaLayerRef.current?.clearLayers()
    capasPorLimiteRef.current.clear()
    for (const l of limites) {
      const f = parseGeom(l.geojson)
      if (!f) continue
      if (capa === 'limite') {
        const gj = L.geoJSON(f, { style: estiloLimite(l, l.numero === selLim) })
        gj.on('click', () => { if (modoRef.current === 'ver') { setSelLim(l.numero); setObs(l.revision?.observaciones ?? '') } })
        gj.addTo(fincaLayerRef.current!)
        capasPorLimiteRef.current.set(l.numero, gj.getLayers()[0] as L.Polygon)
      } else {
        L.geoJSON(f, { style: ESTILO_FINCA, interactive: false }).addTo(fincaLayerRef.current!)
      }
    }

    zonasLayerRef.current?.clearLayers()
    capasPorZonaRef.current.clear()
    for (const z of zonas) {
      const f = parseGeom(z.geojson)
      if (!f) continue
      if (capa === 'limite') {
        L.geoJSON(f, { style: ESTILO_SITIO_TENUE, interactive: false }).addTo(zonasLayerRef.current!)
        continue
      }
      const gj = L.geoJSON(f, { style: estiloZona(z, z.zona_numero === selNum) })
      gj.on('click', () => { if (modoRef.current === 'ver') { setSelNum(z.zona_numero); setObs(z.revision?.observaciones ?? '') } })
      gj.addTo(zonasLayerRef.current!)
      const poly = gj.getLayers()[0] as L.Polygon
      capasPorZonaRef.current.set(z.zona_numero, poly)
    }
    if (capa === 'limite') capasPorLimiteRef.current.forEach(p => p.bringToFront())

    // Ajustar la vista la primera vez que hay algo que mostrar
    if (!fittedRef.current) {
      try {
        const capas = [...(zonasLayerRef.current?.getLayers() ?? []), ...(fincaLayerRef.current?.getLayers() ?? [])]
        if (capas.length) {
          const bounds = L.featureGroup(capas).getBounds()
          if (bounds.isValid()) { map.fitBounds(bounds.pad(0.2)); fittedRef.current = true }
        }
      } catch { /* sin geometrías válidas */ }
    }
  }, [zonas, limites, selNum, selLim, familia, modo, capa])

  // ─── Trazo por GPS en curso ─────────────────────────────────────────────────
  useEffect(() => {
    const capaTrazo = trazoLayerRef.current
    if (!capaTrazo) return
    capaTrazo.clearLayers()
    if (modo !== 'gps' || puntosGps.length === 0) return
    const latlngs = puntosGps.map(([lon, lat]) => L.latLng(lat, lon))
    const color = capa === 'limite' ? '#ffffff' : '#e1a644'
    if (latlngs.length >= 3) L.polygon(latlngs, { color, weight: 3, fillColor: color, fillOpacity: 0.12, dashArray: '6 4', interactive: false }).addTo(capaTrazo)
    else L.polyline(latlngs, { color, weight: 3, dashArray: '6 4', interactive: false }).addTo(capaTrazo)
    latlngs.forEach((ll, i) => L.circleMarker(ll, {
      radius: i === 0 ? 7 : 5, color: '#1e1a18', weight: 2, fillColor: color, fillOpacity: 1, interactive: false,
    }).addTo(capaTrazo))
  }, [puntosGps, modo, capa])

  // ─── GPS ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!('geolocation' in navigator)) { setGpsError('Este dispositivo no tiene GPS disponible'); return }
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        setGpsError(null)
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }
        setGps(p)

        // Predio de práctica: en el primer fix real de GPS, las zonas de
        // ejercicio (hasta ahora en la ubicación de respaldo) se regeneran
        // alrededor de este punto. Se ancla una sola vez por predio.
        const fam = familiaRef.current
        if (fam?.es_practica && !fam.practica_anclada && !anclandoRef.current) {
          anclandoRef.current = true
          const { finca, siembra } = generarZonasPractica(p.lat, p.lon)
          db.familias.update(fam.id!, {
            zonas_finca: finca,
            zonas_sig:   siembra,
            num_zonas:   siembra.length,
            practica_anclada: true,
            updated_at:  new Date().toISOString(),
          }).then(() => {
            fittedRef.current = false
            return cargar()
          })
        }

        const map = mapRef.current
        if (!map) return
        if (!gpsMarkerRef.current) {
          gpsCircleRef.current = L.circle([p.lat, p.lon], { radius: p.accuracy, color: '#3b82f6', weight: 1, fillOpacity: 0.1 }).addTo(map)
          gpsMarkerRef.current = L.circleMarker([p.lat, p.lon], { radius: 7, color: '#ffffff', weight: 2, fillColor: '#3b82f6', fillOpacity: 1 }).addTo(map)
          // Predio sin nada dibujado todavía (campo primero): el mapa arranca donde está el técnico.
          if (!fittedRef.current) { map.setView([p.lat, p.lon], 17); fittedRef.current = true }
        } else {
          gpsMarkerRef.current.setLatLng([p.lat, p.lon])
          gpsCircleRef.current?.setLatLng([p.lat, p.lon]).setRadius(p.accuracy)
        }
        if (siguiendoRef.current) map.panTo([p.lat, p.lon])
      },
      err => setGpsError(err.code === err.PERMISSION_DENIED
        ? 'Permiso de ubicación denegado — actívalo para geolocalizarte en las zonas'
        : 'Sin señal de GPS todavía…'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function centrarEnMi() {
    setSiguiendo(true)
    if (gps && mapRef.current) mapRef.current.setView([gps.lat, gps.lon], Math.max(mapRef.current.getZoom(), 17))
  }

  function cambiarCapa(c: Capa) {
    if (modo !== 'ver') return
    setCapa(c)
    setSelNum(null)
    setSelLim(null)
    setObs('')
  }

  // ─── Guardar revisiones (Dexie, offline-first) ──────────────────────────────
  // Si hay una revisión local PENDIENTE del mismo polígono se actualiza (la
  // última acción gana); si ya está sincronizada, se crea una revisión nueva.
  // La fusión la decide `fusionarRevision`: la última acción manda, pero una
  // geometría ya corregida o dibujada en terreno no se pierde nunca. Vale igual
  // para los sitios de siembra y para el límite del predio.
  async function upsertRevision(
    objetivo: { revision: RevisionRecord | null; zona_id: string | null; numero: number; tipo: TipoRevision },
    cambios: CambiosRevision,
  ) {
    if (!familia?.predio_core_id) return
    const previa = objetivo.revision && objetivo.revision.sync_status !== 'synced' ? objetivo.revision : null
    if (previa) {
      await db.revisiones.update(previa.id!, {
        ...fusionarRevision(previa, cambios),
        observaciones: obs,
        sync_status: 'pending',
        sync_error: null,
        updated_at: new Date().toISOString(),
      })
    } else {
      await db.revisiones.add(newRevision({
        familia_local_id: familia.local_id,
        predio_core_id:   familia.predio_core_id,
        zona_id:          objetivo.zona_id,
        zona_numero:      objetivo.numero,
        observaciones:    obs,
        tipo:             objetivo.tipo,
        ...cambios,
      }))
    }
    await cargar()
  }

  const objetivoSel = () =>
    zonaSel ? { revision: zonaSel.revision, zona_id: zonaSel.zona_id, numero: zonaSel.zona_numero, tipo: 'restauracion' as const }
    : limSel ? { revision: limSel.revision, zona_id: limSel.zona_id, numero: limSel.numero, tipo: 'finca' as const }
    : null

  async function confirmarSel() {
    const o = objetivoSel()
    if (!o) return
    await upsertRevision(o, { accion: 'confirmada', metodo: null, geojson: null, area_ha: null })
  }

  async function descartarZona() {
    if (!zonaSel) return
    if (!window.confirm(`¿Descartar la Zona ${zonaSel.zona_numero}? Quedará marcada como NO apta para siembra.`)) return
    await upsertRevision(
      { revision: zonaSel.revision, zona_id: zonaSel.zona_id, numero: zonaSel.zona_numero, tipo: 'restauracion' },
      { accion: 'descartada', metodo: null, geojson: null, area_ha: null },
    )
  }

  async function restaurarSel() {
    // Deshacer una revisión local que aún no se ha sincronizado
    const o = objetivoSel()
    if (!o?.revision || o.revision.sync_status === 'synced') return
    await db.revisiones.delete(o.revision.id!)
    if (o.zona_id === null) { setSelNum(null); setSelLim(null) }   // lo dibujado desaparece
    await cargar()
  }

  function quitarFantasma() {
    if (ghostLayerRef.current) {
      mapRef.current?.removeLayer(ghostLayerRef.current)
      ghostLayerRef.current = null
    }
  }

  function empezarEdicion() {
    const map = mapRef.current
    const capaEd = zonaSel ? capasPorZonaRef.current.get(zonaSel.zona_numero)
      : limSel ? capasPorLimiteRef.current.get(limSel.numero) : undefined
    const geojson = zonaSel?.geojson ?? limSel?.geojson
    if (!capaEd || !map || !geojson) return
    editLayerRef.current = capaEd

    // Sombra fija del límite tal como estaba justo antes de esta corrección
    const original = parseGeom(geojson)
    if (original) {
      const ghost = L.geoJSON(original, { style: ESTILO_FANTASMA })
      ghost.addTo(map)
      const ghostPoly = ghost.getLayers()[0] as L.Polygon | undefined
      ghostPoly?.bringToBack()
      ghostLayerRef.current = ghost
    }

    // removeVertexOn 'click': tocar un vértice lo elimina; arrastrarlo lo mueve
    // (Leaflet ya distingue toque-sin-mover de arrastre real, así que no chocan).
    // snappable:false — geoman por defecto imanta el vértice arrastrado a la
    // capa más cercana (incluida la sombra del límite anterior u otras zonas).
    capaEd.pm.enable({ allowSelfIntersection: false, removeVertexOn: 'click', snappable: false })
    capaEd.bringToFront()
    setModo('editar')
  }

  async function guardarEdicion() {
    const capaEd = editLayerRef.current
    const o = objetivoSel()
    if (!capaEd || !o) return
    capaEd.pm.disable()
    const feat = capaEd.toGeoJSON()
    const geomStr = JSON.stringify(feat.geometry)
    setModo('ver')
    editLayerRef.current = null
    quitarFantasma()
    // Lo dibujado en campo (aún sin id) que se re-edita sigue siendo 'nuevo'
    const accion = o.zona_id === null && o.revision?.sync_status !== 'synced' ? 'nueva' : 'modificada'
    await upsertRevision(o, { accion, metodo: accion === 'nueva' ? (o.revision?.metodo ?? 'nueva') : 'vertices', geojson: geomStr, area_ha: areaHa(geomStr) })
  }

  function cancelarEdicion() {
    editLayerRef.current?.pm.disable()
    editLayerRef.current = null
    quitarFantasma()
    setModo('ver')
    cargar()   // repintar la geometría original
  }

  function empezarDibujo() {
    const map = mapRef.current
    if (!map) return
    setSelNum(null)
    setSelLim(null)
    setModo('dibujar')
    map.pm.enableDraw('Polygon', { allowSelfIntersection: false, snappable: false })
  }

  function cancelarDibujo() {
    mapRef.current?.pm.disableDraw()
    setModo('ver')
  }

  // ─── Trazar caminando: un vértice por cada «Marcar punto» con el GPS ─────
  function empezarGps() {
    setSelNum(null)
    setSelLim(null)
    setPuntosGps([])
    setSiguiendo(true)
    setModo('gps')
  }
  function marcarPunto() {
    if (!gps) return
    setPuntosGps(p => [...p, [gps.lon, gps.lat]])
  }
  function quitarUltimoPunto() { setPuntosGps(p => p.slice(0, -1)) }
  function cancelarGps() { setPuntosGps([]); setModo('ver') }
  async function terminarGps() {
    if (puntosGps.length < 3) return
    const anillo = [...puntosGps, puntosGps[0]]
    const geomStr = JSON.stringify({ type: 'Polygon', coordinates: [anillo] })
    setPuntosGps([])
    await guardarNueva(geomStr, 'gps')
  }

  async function guardarNueva(geomStr: string, metodo: 'nueva' | 'gps') {
    const f = await db.familias.where('local_id').equals(id!).first()
    if (!f?.predio_core_id) return
    await db.revisiones.add(newRevision({
      familia_local_id: f.local_id,
      predio_core_id:   f.predio_core_id,
      zona_id:          null,
      zona_numero:      0,   // se renumera al vuelo en zonasVigentes / limitesVigentes
      accion:           'nueva',
      metodo,
      geojson:          geomStr,
      area_ha:          areaHa(geomStr),
      observaciones:    '',
      tipo:             tipoDeCapa(capaRef.current),
    }))
    setModo('ver')
    await cargar()
  }

  async function guardarObservaciones() {
    const o = objetivoSel()
    if (!o?.revision || o.revision.sync_status === 'synced') return
    await db.revisiones.update(o.revision.id!, { observaciones: obs, updated_at: new Date().toISOString() })
    await cargar()
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  if (!loaded) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bosque" />
    </div>
  )

  if (!familia) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-600 px-8">
      <p className="text-base text-center">Predio no encontrado en este celular.</p>
      <button onClick={() => navigate('/')} className="boton boton-bosque">Ir al inicio</button>
    </div>
  )

  const sel = zonaSel ?? limSel
  const et = sel ? etiquetaRevision(sel) : null
  const revPendiente = sel?.revision && sel.revision.sync_status !== 'synced'
  // Corrección local ya guardada: no hay nada más que confirmar. "Confirmar"
  // significa "está bien tal como vino del SIG", así que ofrecerlo aquí solo
  // confunde (y era lo que hacía creer que el cambio no se había guardado).
  const yaCorregida = !!sel?.revision
    && sel.revision.sync_status !== 'synced'
    && !!sel.revision.geojson
    && (sel.revision.accion === 'modificada' || sel.revision.accion === 'nueva')
  const sitiosActivos = zonas.filter(z => !z.descartada)
  const precisionMala = !!gps && gps.accuracy > 15

  return (
    <div className="h-[100svh] flex flex-col">

      {/* Cabecera */}
      <header className="cabecera px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 flex items-center gap-3 z-[1100] rounded-b-3xl">
        <button onClick={() => navigate(`/familia/${id}`)} className="boton-mapa vidrio-oscuro !w-11 !h-11" aria-label="Volver">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-titulo text-lg leading-tight truncate flex items-center gap-1.5">
            <Satellite size={15} className="opacity-80 shrink-0" /> {familia.nombre_predio || 'Módulo SIG'}
          </p>
          <p className="text-xs opacity-80">
            {sitiosActivos.length} sitio(s) de siembra · {limites.length ? 'con límite' : 'sin límite'}
            {pendientes > 0 && ` · ${pendientes} sin sincronizar`}
          </p>
        </div>
        {!online && <span className="text-[11px] font-bold vidrio-oscuro px-2.5 py-1 rounded-full shrink-0">SIN SEÑAL</span>}
      </header>

      {/* Mapa */}
      <div className="relative flex-1 min-h-0 -mt-4">
        <div ref={mapDivRef} className="absolute inset-0" />

        {/* Botones flotantes */}
        <div className="absolute right-3 top-7 z-[1000] flex flex-col gap-2.5">
          <button onClick={centrarEnMi}
            className={`boton-mapa shadow-lg ${siguiendo && gps ? 'boton-bosque' : 'vidrio text-bosque'}`}
            aria-label="Centrar en mi ubicación" title="Centrar en mi ubicación">
            <Crosshair size={22} />
          </button>
          {modo === 'ver' && (
            <>
              <button onClick={empezarDibujo} className="boton-mapa boton-ambar"
                aria-label={capa === 'limite' ? 'Dibujar el límite en el mapa' : 'Dibujar un sitio nuevo'}
                title={capa === 'limite' ? 'Dibujar el límite en el mapa' : 'Dibujar un sitio nuevo'}>
                <Plus size={24} />
              </button>
              <button onClick={empezarGps} disabled={!gps} className="boton-mapa vidrio text-bosque disabled:opacity-40"
                aria-label="Trazar caminando con el GPS" title="Trazar caminando con el GPS">
                <Footprints size={22} />
              </button>
            </>
          )}
        </div>

        {/* Barra de estado GPS */}
        <div className="absolute left-3 right-[4.75rem] top-7 z-[1000]">
          <div className="vidrio rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug">
            {gpsError ? (
              <span className="flex items-center gap-1.5 text-amber-800 font-medium"><AlertTriangle size={15} /> {gpsError}</span>
            ) : !gps ? (
              <span className="flex items-center gap-1.5 text-gray-600"><RefreshCw size={15} className="animate-spin" /> Buscando señal GPS…</span>
            ) : capa === 'sitios' && posicion?.dentroDe ? (
              <span className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                <MapPin size={15} /> Estás DENTRO de la Zona {posicion.dentroDe.zona_numero}
                <span className="font-normal text-gray-500">±{Math.round(gps.accuracy)} m</span>
              </span>
            ) : capa === 'sitios' && posicion?.masCercana ? (
              <span className="flex items-center gap-1.5 text-gray-800">
                <MapPin size={15} className="text-bosque shrink-0" />
                <span>A <strong>{distanciaTexto(posicion.distancia_m!)}</strong> al <strong>{posicion.rumbo}</strong> de la Zona {posicion.masCercana.zona_numero}
                <span className="text-gray-500"> ±{Math.round(gps.accuracy)} m</span></span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-gray-700">
                <MapPin size={15} className="text-bosque" /> GPS activo
                <span className={precisionMala ? 'text-amber-800 font-semibold' : 'text-gray-500'}>±{Math.round(gps.accuracy)} m</span>
              </span>
            )}
          </div>
        </div>

        {/* Instrucción en modo dibujo */}
        {modo === 'dibujar' && (
          <div className="absolute left-3 right-3 bottom-4 z-[1000] vidrio rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-gray-800">
              Toca el mapa para marcar los vértices {capa === 'limite' ? 'del límite del predio' : 'del sitio de siembra'}. Cierra tocando el primer punto.
            </p>
            <button onClick={cancelarDibujo} className="boton boton-vidrio !min-h-11 !px-3.5 shrink-0"><X size={16} /> Cancelar</button>
          </div>
        )}

        {/* Trazar caminando con el GPS */}
        {modo === 'gps' && (
          <div className="absolute left-3 right-3 bottom-4 z-[1000] vidrio rounded-3xl p-3.5">
            <p className="text-sm text-gray-800 mb-1">
              Camina {capa === 'limite' ? 'el lindero del predio' : 'el borde del sitio'} y pulsa <strong>Marcar punto</strong> en cada quiebre.
            </p>
            <p className={`text-xs mb-3 ${precisionMala ? 'text-amber-800 font-semibold' : 'text-gray-600'}`}>
              {puntosGps.length} punto(s){gps ? ` · precisión ±${Math.round(gps.accuracy)} m` : ''}
              {precisionMala && ' — espera unos segundos quieto para que mejore'}
            </p>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button onClick={marcarPunto} disabled={!gps} className="boton boton-ambar text-base">
                <MapPin size={18} /> Marcar punto
              </button>
              <button onClick={quitarUltimoPunto} disabled={!puntosGps.length} className="boton boton-vidrio !px-3.5" aria-label="Quitar el último punto">
                <Undo2 size={18} />
              </button>
              <button onClick={terminarGps} disabled={puntosGps.length < 3} className="boton boton-bosque">
                <Check size={18} /> Cerrar y guardar
              </button>
              <button onClick={cancelarGps} className="boton boton-vidrio !px-3.5" aria-label="Cancelar"><X size={18} /></button>
            </div>
          </div>
        )}

        {/* Guardar/cancelar en modo edición */}
        {modo === 'editar' && (
          <div className="absolute left-3 right-3 bottom-4 z-[1000] vidrio rounded-3xl p-3.5">
            <p className="text-sm text-gray-800 mb-3">Arrastra un vértice para moverlo, tócalo para eliminarlo, o toca una línea para agregar uno. La sombra gris es como estaba antes.</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={guardarEdicion} className="boton boton-bosque"><Check size={18} /> Guardar</button>
              <button onClick={cancelarEdicion} className="boton boton-vidrio"><X size={18} /> Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {/* Panel inferior */}
      {modo === 'ver' && (
        <div className="vidrio !border-x-0 !border-b-0 rounded-t-3xl -mt-5 relative z-[1050] px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] max-h-[48%] overflow-y-auto">
          {/* Capa: sitios o límite */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-full bg-gray-200/80 mb-3" role="tablist">
            {([['sitios', 'Sitios de siembra', Sprout, sitiosActivos.length], ['limite', 'Límite del predio', Fence, limites.length]] as const).map(([c, txt, Icono, n]) => (
              <button key={c} role="tab" aria-selected={capa === c} onClick={() => cambiarCapa(c)}
                className={`flex items-center justify-center gap-1.5 min-h-11 rounded-full text-sm font-semibold transition-colors ${capa === c ? 'boton-bosque' : 'text-gray-700'}`}>
                <Icono size={16} /> {txt} <span className={`text-xs ${capa === c ? 'opacity-80' : 'text-gray-500'}`}>{n}</span>
              </button>
            ))}
          </div>

          {campoPrimero && !sel && (
            <p className="text-[13px] text-amber-900 bg-amber-100 border border-amber-200 rounded-2xl px-3.5 py-2.5 mb-3">
              <strong>Campo primero.</strong> Este predio llegó sin propuesta del SIG: delimita el predio y dibuja los sitios de siembra.
              El SIG los confirma después desde la intranet.
            </p>
          )}

          {!sel ? (
            capa === 'sitios' ? (
              zonas.length === 0 ? (
                <Vacio
                  texto="Todavía no hay sitios de siembra. Dibújalos en el mapa o trázalos caminando el borde con el GPS."
                  onDibujar={empezarDibujo} onGps={empezarGps} gps={!!gps} />
              ) : (
                <>
                  <div className="flex gap-2 flex-wrap">
                    {zonas.map(z => {
                      const e = etiquetaRevision(z)
                      return (
                        <button key={z.zona_numero}
                          onClick={() => { setSelNum(z.zona_numero); setObs(z.revision?.observaciones ?? '') }}
                          className="tarjeta flex items-center gap-2 !rounded-2xl px-3.5 py-2.5 text-left min-h-12 active:scale-[0.98] transition-transform">
                          <span className="text-[15px] font-semibold text-gray-900">Zona {z.zona_numero}</span>
                          <span className="text-sm text-gray-600">{z.area_ha != null ? `${z.area_ha.toFixed(1)} ha` : '—'}</span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${e.cls}`}>{e.txt}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-600 mt-3">
                    Toca una zona para verificarla: confirmarla tal cual, corregir su límite o descartarla. Con <strong>+</strong> dibujas un sitio nuevo
                    y con la huella lo trazas caminando. La línea blanca punteada es el límite del predio.
                  </p>
                </>
              )
            ) : (
              limites.length === 0 ? (
                <Vacio
                  texto="Este predio no tiene límite todavía. Recorre el lindero con el propietario y trázalo caminando con el GPS, o dibújalo sobre el satelital."
                  onDibujar={empezarDibujo} onGps={empezarGps} gps={!!gps} />
              ) : (
                <>
                  <div className="flex gap-2 flex-wrap">
                    {limites.map(l => {
                      const e = etiquetaRevision(l)
                      return (
                        <button key={l.numero}
                          onClick={() => { setSelLim(l.numero); setObs(l.revision?.observaciones ?? '') }}
                          className="tarjeta flex items-center gap-2 !rounded-2xl px-3.5 py-2.5 text-left min-h-12 active:scale-[0.98] transition-transform">
                          <span className="text-[15px] font-semibold text-gray-900">{limites.length > 1 ? `Límite ${l.numero}` : 'Límite'}</span>
                          <span className="text-sm text-gray-600">{l.area_ha != null ? `${l.area_ha.toFixed(1)} ha` : '—'}</span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${e.cls}`}>{l.origen === 'sig' && !l.revision ? 'Del SIG, por verificar' : e.txt}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-600 mt-3">
                    Toca el límite para confirmarlo o corregir el lindero. Si el predio tiene otro pedazo, dibújalo con <strong>+</strong>.
                  </p>
                </>
              )
            )
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <h2 className="text-xl text-gray-900">
                    {zonaSel ? `Zona ${zonaSel.zona_numero}` : limites.length > 1 ? `Límite ${limSel!.numero}` : 'Límite del predio'}
                  </h2>
                  {et && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${et.cls}`}>{et.txt}</span>}
                  <span className="text-sm text-gray-600">{sel.area_ha != null ? `${sel.area_ha.toFixed(2)} ha` : ''}</span>
                </div>
                <button onClick={() => { setSelNum(null); setSelLim(null) }} className="boton-mapa !w-10 !h-10 text-gray-600" aria-label="Cerrar"><X size={18} /></button>
              </div>

              {zonaSel && posicion?.dentroDe?.zona_numero === zonaSel.zona_numero && (
                <p className="text-sm text-emerald-800 font-semibold mb-2">Estás parado dentro de esta zona</p>
              )}

              {zonaSel?.retirada_del_sig && (
                <p className="text-sm text-gray-700 bg-gray-100 rounded-2xl px-3.5 py-2.5 mb-2">
                  El SIG cambió esta zona y ya no la incluye. Lo que trabajaste aquí se conserva tal cual, pero no
                  se le piden más datos — trabaja sobre las zonas vigentes.
                </p>
              )}

              {sel.revision?.sync_status === 'error' && sel.revision.sync_error && (
                <p className="text-xs text-red-800 bg-red-50 border border-red-100 rounded-2xl px-3.5 py-2.5 mb-2">
                  Guardado en este celular, todavía sin subir: {sel.revision.sync_error}
                </p>
              )}

              <textarea
                rows={2}
                placeholder="Observaciones de campo (opcional)…"
                value={obs}
                onChange={e => setObs(e.target.value)}
                onBlur={guardarObservaciones}
                disabled={sel.revision?.sync_status === 'synced'}
                className="mb-3 disabled:bg-gray-50 disabled:text-gray-500"
              />

              <div className={`grid gap-2 ${zonaSel ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <button onClick={confirmarSel} disabled={zonaSel?.descartada || yaCorregida}
                  className="boton boton-bosque !flex-col !gap-1 !rounded-2xl !text-[13px] !px-2">
                  <Check size={20} /> {yaCorregida ? (sel.revision?.accion === 'nueva' ? 'Guardado' : 'Ya corregida') : 'Confirmar'}
                </button>
                <button onClick={empezarEdicion} disabled={zonaSel?.descartada}
                  className="boton boton-pizarra !flex-col !gap-1 !rounded-2xl !text-[13px] !px-2">
                  <Pencil size={20} /> {zonaSel ? 'Corregir límite' : 'Corregir lindero'}
                </button>
                {zonaSel && (
                  <button onClick={descartarZona} disabled={zonaSel.descartada}
                    className="boton boton-arcilla !flex-col !gap-1 !rounded-2xl !text-[13px] !px-2">
                    <Trash2 size={20} /> Descartar
                  </button>
                )}
              </div>

              {yaCorregida && (
                <p className="text-[13px] text-blue-900 bg-blue-50 border border-blue-100 rounded-2xl px-3.5 py-2.5 mt-2.5">
                  {sel.revision?.accion === 'nueva' ? 'Lo que dibujaste' : 'El límite que corregiste'} <strong>ya quedó guardado</strong> en este celular y se sube cuando
                  haya señal. No hace falta confirmarlo aparte: «Confirmar» es solo para dejar algo tal como vino del SIG.
                  Si quieres volver atrás, usa «Deshacer».
                </p>
              )}

              {revPendiente && (
                <button onClick={restaurarSel} className="boton boton-vidrio w-full mt-2.5 !text-sm">
                  <Undo2 size={16} /> Deshacer este cambio (aún sin sincronizar)
                </button>
              )}
              {sel.revision?.sync_status === 'synced' && (
                <p className="text-xs text-gray-600 mt-2">Esta revisión ya se sincronizó al SIG. Puedes volver a corregir o confirmar — quedará como una revisión adicional.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Vacio({ texto, onDibujar, onGps, gps }: { texto: string; onDibujar: () => void; onGps: () => void; gps: boolean }) {
  return (
    <div className="text-center py-1">
      <p className="text-sm text-gray-700 mb-3">{texto}</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onGps} disabled={!gps} className="boton boton-ambar"><Footprints size={18} /> Caminando</button>
        <button onClick={onDibujar} className="boton boton-vidrio"><Plus size={18} /> En el mapa</button>
      </div>
      {!gps && <p className="text-xs text-gray-500 mt-2">Trazar caminando se activa cuando haya señal de GPS.</p>}
    </div>
  )
}
