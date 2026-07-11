import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import {
  ArrowLeft, Crosshair, Plus, Check, X, Pencil, Trash2, Undo2,
  Satellite, AlertTriangle, RefreshCw, MapPin,
} from 'lucide-react'
import { db } from '../../db/schema'
import type { FamiliaRecord } from '../../types/familia'
import type { RevisionRecord } from '../../types/revision'
import { newRevision } from '../../types/revision'
import {
  zonasVigentes, parseGeom, areaHa, posicionRespectoZonas,
  centroZonas, distanciaTexto, type ZonaVigente,
} from '../../lib/geo'
import { generarZonasPractica } from '../../lib/practica'
import { useOnlineStatus } from '../../lib/useOnlineStatus'

// ─── Estilos por estado de la zona ────────────────────────────────────────────
const ESTILO_FINCA: L.PathOptions = { color: '#ffffff', weight: 2, dashArray: '6 4', fill: false }
// Sombra del polígono tal como estaba justo antes de la corrección en curso
const ESTILO_FANTASMA: L.PathOptions = {
  color: '#6b7280', weight: 2, dashArray: '3 5',
  fillColor: '#6b7280', fillOpacity: 0.25, interactive: false,
}

function estiloZona(z: ZonaVigente, seleccionada: boolean): L.PathOptions {
  let color = '#f59e0b'                                    // original del SIG (por verificar)
  if (z.revision?.accion === 'confirmada')  color = '#10b981'
  if (z.revision?.accion === 'modificada')  color = '#3b82f6'
  if (z.revision?.accion === 'nueva')       color = '#14b8a6'
  if (z.descartada)                         color = '#ef4444'
  return {
    color,
    weight: seleccionada ? 5 : 3,
    fillColor: color,
    fillOpacity: z.descartada ? 0.06 : seleccionada ? 0.35 : 0.2,
    dashArray: z.descartada ? '4 6' : undefined,
  }
}

function etiquetaRevision(z: ZonaVigente): { txt: string; cls: string } {
  if (z.descartada)                        return { txt: 'Descartada',        cls: 'bg-red-100 text-red-700' }
  if (z.revision?.accion === 'confirmada') return { txt: 'Confirmada',        cls: 'bg-emerald-100 text-emerald-700' }
  if (z.revision?.accion === 'modificada') return { txt: 'Corregida',         cls: 'bg-blue-100 text-blue-700' }
  if (z.revision?.accion === 'nueva')      return { txt: 'Nueva (campo)',     cls: 'bg-teal-100 text-teal-700' }
  return { txt: 'Por verificar', cls: 'bg-amber-100 text-amber-700' }
}

type Modo = 'ver' | 'editar' | 'dibujar'

// ─── Página ───────────────────────────────────────────────────────────────────
export function SigPage() {
  const { id } = useParams<{ id: string }>()   // familia local_id
  const navigate = useNavigate()
  const online = useOnlineStatus()

  const [familia, setFamilia] = useState<FamiliaRecord | null>(null)
  const [revisiones, setRevisiones] = useState<RevisionRecord[]>([])
  const [loaded, setLoaded] = useState(false)

  const [selNum, setSelNum] = useState<number | null>(null)
  const [modo, setModo] = useState<Modo>('ver')
  const [obs, setObs] = useState('')
  const [gps, setGps] = useState<{ lat: number; lon: number; accuracy: number } | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [siguiendo, setSiguiendo] = useState(true)

  const mapRef = useRef<L.Map | null>(null)
  const mapDivRef = useRef<HTMLDivElement | null>(null)
  const zonasLayerRef = useRef<L.LayerGroup | null>(null)
  const fincaLayerRef = useRef<L.LayerGroup | null>(null)
  const capasPorZonaRef = useRef<Map<number, L.Polygon>>(new Map())
  const gpsMarkerRef = useRef<L.CircleMarker | null>(null)
  const gpsCircleRef = useRef<L.Circle | null>(null)
  const editLayerRef = useRef<L.Polygon | null>(null)
  const ghostLayerRef = useRef<L.GeoJSON | null>(null)
  const fittedRef = useRef(false)
  const siguiendoRef = useRef(true)
  const modoRef = useRef<Modo>('ver')
  const familiaRef = useRef<FamiliaRecord | null>(null)
  const anclandoRef = useRef(false)   // evita doble anclaje si llegan 2 fixes de GPS casi juntos

  siguiendoRef.current = siguiendo
  modoRef.current = modo
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
  const zonaSel = zonas.find(z => z.zona_numero === selNum) ?? null
  const pendientes = revisiones.filter(r => r.sync_status !== 'synced').length

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

    // Si el usuario arrastra el mapa, dejar de seguir el GPS
    map.on('dragstart', () => setSiguiendo(false))

    // Dibujo de zona nueva (geoman)
    map.on('pm:create', (e: { layer: L.Layer }) => {
      const feat = (e.layer as L.Polygon).toGeoJSON()
      map.removeLayer(e.layer)
      map.pm.disableDraw()
      const geomStr = JSON.stringify(feat.geometry)
      guardarNueva(geomStr)
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familia])

  // ─── Pintar capas cada vez que cambian las zonas ────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !familia || modo === 'editar') return   // no repintar en plena edición

    fincaLayerRef.current?.clearLayers()
    for (const fz of familia.zonas_finca) {
      const f = parseGeom(fz.geojson)
      if (f) L.geoJSON(f, { style: ESTILO_FINCA, interactive: false }).addTo(fincaLayerRef.current!)
    }

    zonasLayerRef.current?.clearLayers()
    capasPorZonaRef.current.clear()
    for (const z of zonas) {
      const f = parseGeom(z.geojson)
      if (!f) continue
      const gj = L.geoJSON(f, { style: estiloZona(z, z.zona_numero === selNum) })
      gj.on('click', () => { if (modoRef.current === 'ver') { setSelNum(z.zona_numero); setObs(z.revision?.observaciones ?? '') } })
      gj.addTo(zonasLayerRef.current!)
      const poly = gj.getLayers()[0] as L.Polygon
      capasPorZonaRef.current.set(z.zona_numero, poly)
    }

    // Ajustar la vista la primera vez que hay zonas
    if (zonas.length && !fittedRef.current) {
      try {
        const bounds = L.featureGroup(zonasLayerRef.current!.getLayers()).getBounds()
        if (bounds.isValid()) { map.fitBounds(bounds.pad(0.2)); fittedRef.current = true }
      } catch { /* sin zonas válidas */ }
    }
  }, [zonas, selNum, familia, modo])

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

  // ─── Guardar revisiones (Dexie, offline-first) ──────────────────────────────
  // Si hay una revisión local PENDIENTE de la misma zona se actualiza (la última
  // acción gana); si ya está sincronizada, se crea una revisión nueva.
  async function upsertRevision(z: ZonaVigente, cambios: {
    accion: RevisionRecord['accion']
    metodo: RevisionRecord['metodo']
    geojson: string | null
    area_ha: number | null
  }) {
    if (!familia?.predio_core_id) return
    const previa = z.revision && z.revision.sync_status !== 'synced' ? z.revision : null
    if (previa) {
      await db.revisiones.update(previa.id!, {
        ...cambios,
        observaciones: obs,
        sync_status: 'pending',
        sync_error: null,
        updated_at: new Date().toISOString(),
      })
    } else {
      await db.revisiones.add(newRevision({
        familia_local_id: familia.local_id,
        predio_core_id:   familia.predio_core_id,
        zona_id:          z.zona_id,
        zona_numero:      z.zona_numero,
        observaciones:    obs,
        ...cambios,
      }))
    }
    await cargar()
  }

  async function confirmarZona() {
    if (!zonaSel) return
    await upsertRevision(zonaSel, { accion: 'confirmada', metodo: null, geojson: null, area_ha: null })
  }

  async function descartarZona() {
    if (!zonaSel) return
    if (!window.confirm(`¿Descartar la Zona ${zonaSel.zona_numero}? Quedará marcada como NO apta para siembra.`)) return
    await upsertRevision(zonaSel, { accion: 'descartada', metodo: null, geojson: null, area_ha: null })
  }

  async function restaurarZona() {
    // Deshacer una revisión local que aún no se ha sincronizado
    if (!zonaSel?.revision || zonaSel.revision.sync_status === 'synced') return
    await db.revisiones.delete(zonaSel.revision.id!)
    if (zonaSel.zona_id === null) setSelNum(null)   // la zona nueva desaparece
    await cargar()
  }

  function quitarFantasma() {
    if (ghostLayerRef.current) {
      mapRef.current?.removeLayer(ghostLayerRef.current)
      ghostLayerRef.current = null
    }
  }

  function empezarEdicion() {
    if (!zonaSel) return
    const capa = capasPorZonaRef.current.get(zonaSel.zona_numero)
    const map = mapRef.current
    if (!capa || !map) return
    editLayerRef.current = capa

    // Sombra fija del límite tal como estaba justo antes de esta corrección
    const original = parseGeom(zonaSel.geojson)
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
    capa.pm.enable({ allowSelfIntersection: false, removeVertexOn: 'click', snappable: false })
    capa.bringToFront()
    setModo('editar')
  }

  async function guardarEdicion() {
    const capa = editLayerRef.current
    if (!capa || !zonaSel) return
    capa.pm.disable()
    const feat = capa.toGeoJSON()
    const geomStr = JSON.stringify(feat.geometry)
    setModo('ver')
    editLayerRef.current = null
    quitarFantasma()
    // Una zona nueva (aún sin id) que se re-edita sigue siendo 'nueva'
    const accion = zonaSel.zona_id === null && zonaSel.revision?.sync_status !== 'synced' ? 'nueva' : 'modificada'
    await upsertRevision(zonaSel, { accion, metodo: accion === 'nueva' ? 'nueva' : 'vertices', geojson: geomStr, area_ha: areaHa(geomStr) })
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
    setModo('dibujar')
    map.pm.enableDraw('Polygon', { allowSelfIntersection: false, snappable: false })
  }

  function cancelarDibujo() {
    mapRef.current?.pm.disableDraw()
    setModo('ver')
  }

  async function guardarNueva(geomStr: string) {
    const f = await db.familias.where('local_id').equals(id!).first()
    if (!f?.predio_core_id) return
    await db.revisiones.add(newRevision({
      familia_local_id: f.local_id,
      predio_core_id:   f.predio_core_id,
      zona_id:          null,
      zona_numero:      0,   // se renumera al vuelo en zonasVigentes
      accion:           'nueva',
      metodo:           'nueva',
      geojson:          geomStr,
      area_ha:          areaHa(geomStr),
      observaciones:    '',
    }))
    setModo('ver')
    await cargar()
  }

  async function guardarObservaciones() {
    if (!zonaSel?.revision || zonaSel.revision.sync_status === 'synced') return
    await db.revisiones.update(zonaSel.revision.id!, { observaciones: obs, updated_at: new Date().toISOString() })
    await cargar()
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  if (!loaded) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0d7377]" />
    </div>
  )

  if (!familia) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500 px-8">
      <p className="text-sm text-center">Familia no encontrada.</p>
      <button onClick={() => navigate('/')} className="text-[#0d7377] text-sm font-semibold">Ir al inicio</button>
    </div>
  )

  const et = zonaSel ? etiquetaRevision(zonaSel) : null
  const revPendiente = zonaSel?.revision && zonaSel.revision.sync_status !== 'synced'

  return (
    <div className="h-screen flex flex-col bg-[#f0fafa]">

      {/* Header */}
      <header className="bg-[#0d7377] text-white px-4 py-3 flex items-center gap-3 z-[1100]">
        <button onClick={() => navigate(`/familia/${id}`)} className="p-1 rounded"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate flex items-center gap-1.5">
            <Satellite size={14} className="opacity-80" /> {familia.nombre_predio || 'Módulo SIG'}
          </p>
          <p className="text-xs opacity-60">
            {zonas.filter(z => !z.descartada).length} zona(s) de siembra
            {pendientes > 0 && ` · ${pendientes} cambio(s) sin sincronizar`}
          </p>
        </div>
        {!online && <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full shrink-0">OFFLINE</span>}
      </header>

      {/* Mapa */}
      <div className="relative flex-1 min-h-0">
        <div ref={mapDivRef} className="absolute inset-0" />

        {/* Botones flotantes */}
        <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
          <button onClick={centrarEnMi}
            className={`w-11 h-11 rounded-xl shadow-lg flex items-center justify-center ${siguiendo && gps ? 'bg-[#0d7377] text-white' : 'bg-white text-gray-700'}`}
            title="Centrar en mi ubicación">
            <Crosshair size={20} />
          </button>
          {modo === 'ver' && (
            <button onClick={empezarDibujo}
              className="w-11 h-11 rounded-xl bg-white text-teal-700 shadow-lg flex items-center justify-center"
              title="Dibujar zona nueva">
              <Plus size={22} />
            </button>
          )}
        </div>

        {/* Barra de estado GPS */}
        <div className="absolute left-3 right-16 top-3 z-[1000]">
          <div className="bg-white/95 backdrop-blur rounded-xl shadow px-3 py-2 text-xs">
            {gpsError ? (
              <span className="flex items-center gap-1.5 text-amber-700"><AlertTriangle size={13} /> {gpsError}</span>
            ) : !gps ? (
              <span className="flex items-center gap-1.5 text-gray-500"><RefreshCw size={13} className="animate-spin" /> Buscando señal GPS…</span>
            ) : posicion?.dentroDe ? (
              <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <MapPin size={13} /> Estás DENTRO de la Zona {posicion.dentroDe.zona_numero}
                <span className="font-normal text-gray-400">±{Math.round(gps.accuracy)} m</span>
              </span>
            ) : posicion?.masCercana ? (
              <span className="flex items-center gap-1.5 text-gray-700">
                <MapPin size={13} className="text-[#0d7377]" />
                A <strong>{distanciaTexto(posicion.distancia_m!)}</strong> al <strong>{posicion.rumbo}</strong> de la Zona {posicion.masCercana.zona_numero}
                <span className="text-gray-400">±{Math.round(gps.accuracy)} m</span>
              </span>
            ) : (
              <span className="text-gray-500">GPS activo · sin zonas para comparar</span>
            )}
          </div>
        </div>

        {/* Instrucción en modo dibujo */}
        {modo === 'dibujar' && (
          <div className="absolute left-3 right-3 bottom-3 z-[1000] bg-teal-600 text-white rounded-xl shadow-lg px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-xs font-medium">Toca el mapa para marcar los vértices de la zona nueva. Cierra el polígono tocando el primer punto.</p>
            <button onClick={cancelarDibujo} className="shrink-0 flex items-center gap-1 text-xs font-bold bg-white/20 px-3 py-1.5 rounded-lg">
              <X size={13} /> Cancelar
            </button>
          </div>
        )}

        {/* Guardar/cancelar en modo edición */}
        {modo === 'editar' && (
          <div className="absolute left-3 right-3 bottom-3 z-[1000] bg-blue-600 text-white rounded-xl shadow-lg px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-xs font-medium">Arrastra un vértice para moverlo, tócalo para eliminarlo, o toca una línea para agregar uno nuevo. La sombra gris punteada es el límite anterior.</p>
            <div className="flex gap-2 shrink-0">
              <button onClick={guardarEdicion} className="flex items-center gap-1 text-xs font-bold bg-white text-blue-700 px-3 py-1.5 rounded-lg">
                <Check size={13} /> Guardar
              </button>
              <button onClick={cancelarEdicion} className="flex items-center gap-1 text-xs font-bold bg-white/20 px-3 py-1.5 rounded-lg">
                <X size={13} /> Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Panel inferior */}
      {modo === 'ver' && (
        <div className="bg-white border-t border-gray-100 px-4 pt-3 pb-4 max-h-[45%] overflow-y-auto">
          {!zonaSel ? (
            <>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Zonas de siembra (SIG I)</p>
              <div className="flex gap-2 flex-wrap">
                {zonas.map(z => {
                  const e = etiquetaRevision(z)
                  return (
                    <button key={z.zona_numero}
                      onClick={() => { setSelNum(z.zona_numero); setObs(z.revision?.observaciones ?? '') }}
                      className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 text-left active:bg-gray-50">
                      <span className="text-sm font-bold text-gray-800">Zona {z.zona_numero}</span>
                      <span className="text-xs text-gray-500">{z.area_ha != null ? `${z.area_ha.toFixed(1)} ha` : '—'}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${e.cls}`}>{e.txt}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-3">
                Toca una zona (en el mapa o aquí) para verificarla: confirmarla tal cual, corregir su límite o descartarla.
                El polígono blanco punteado es el límite de la finca.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-sm font-bold text-gray-800">Zona {zonaSel.zona_numero}</p>
                  {et && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${et.cls}`}>{et.txt}</span>}
                  <span className="text-xs text-gray-500">{zonaSel.area_ha != null ? `${zonaSel.area_ha.toFixed(2)} ha` : ''}</span>
                </div>
                <button onClick={() => setSelNum(null)} className="text-gray-400 p-1"><X size={16} /></button>
              </div>

              {posicion?.dentroDe?.zona_numero === zonaSel.zona_numero && (
                <p className="text-xs text-emerald-700 font-semibold mb-2">✓ Estás parado dentro de esta zona</p>
              )}

              <textarea
                rows={2}
                placeholder="Observaciones de campo (opcional)…"
                value={obs}
                onChange={e => setObs(e.target.value)}
                onBlur={guardarObservaciones}
                disabled={zonaSel.revision?.sync_status === 'synced'}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-3 disabled:bg-gray-50 disabled:text-gray-400"
              />

              <div className="grid grid-cols-3 gap-2">
                <button onClick={confirmarZona} disabled={zonaSel.descartada}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">
                  <Check size={16} /> Confirmar
                </button>
                <button onClick={empezarEdicion} disabled={zonaSel.descartada}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:opacity-40">
                  <Pencil size={16} /> Corregir límite
                </button>
                <button onClick={descartarZona} disabled={zonaSel.descartada}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-red-500 text-white text-xs font-bold disabled:opacity-40">
                  <Trash2 size={16} /> Descartar
                </button>
              </div>

              {revPendiente && (
                <button onClick={restaurarZona}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-semibold">
                  <Undo2 size={14} /> Deshacer este cambio (aún sin sincronizar)
                </button>
              )}
              {zonaSel.revision?.sync_status === 'synced' && (
                <p className="text-[11px] text-gray-400 mt-2">Esta revisión ya fue sincronizada al SIG. Puedes volver a corregir o confirmar — quedará como una revisión adicional.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
