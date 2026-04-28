import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink, WifiOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useOnlineStatus } from '../../lib/useOnlineStatus'

// ─── Utilidades de visualización ──────────────────────────────────────────────
function labelKey(key: string): string {
  const MAP: Record<string, string> = {
    codigo_formato: 'Código formato', version: 'Versión',
    fecha_visita: 'Fecha de visita', evaluador_1: 'Evaluador 1', evaluador_2: 'Evaluador 2',
    codigo_predio: 'Código predio', nombre_predio: 'Nombre del predio',
    municipio: 'Municipio', vereda: 'Vereda', propietario_tenedor: 'Propietario / tenedor',
    contacto_propietario: 'Contacto', num_zonas: 'Nº zonas',
    senal_celular: 'Señal celular', operador_celular: 'Operador',
    area_zonas_ha: 'Área (ha)', tiempo_desde_via: 'Tiempo desde vía',
    disposicion_propietario: 'Disposición propietario', ajustes_poligono: 'Ajustes polígono',
    observaciones_sociales: 'Observaciones sociales', mano_obra_disponible: 'Mano de obra disponible',
    experiencia_restauracion: 'Experiencia restauración',
    cobertura_dominante: 'Cobertura dominante', pct_cobertura_boscosa: '% cobertura boscosa',
    densidad_rastrojo: 'Densidad rastrojo', especies_arboreas_alturas: 'Especies arbóreas / alturas',
    regeneracion_natural: 'Regeneración natural', defaunacion: 'Defaunación',
    presion_fauna_ganado: 'Presión fauna / ganado', requiere_proteccion: 'Requiere protección',
    textura_suelo: 'Textura suelo', drenaje_superficial: 'Drenaje superficial',
    pendiente: 'Pendiente', presencia_roca: 'Presencia de roca', erosion: 'Erosión',
    fuente_agua: 'Fuente de agua', distancia_agua_m: 'Distancia agua (m)',
    observaciones_suelo: 'Observaciones suelo',
    foto_textura_url: 'Foto textura', foto_drenaje_url: 'Foto drenaje',
    foto_pendiente_url: 'Foto pendiente', foto_erosion_url: 'Foto erosión',
    tipo_via: 'Tipo de vía', medio_acceso_zonas: 'Medio de acceso',
    tiempo_predio_zona: 'Tiempo predio–zona', condicion_camino: 'Condición del camino',
    lugar_deposito_material: 'Lugar depósito material', complejidad_acceso: 'Complejidad acceso',
    descripcion_ruta: 'Descripción ruta', foto_via_url: 'Foto vía',
    quemas_recientes: 'Quemas recientes', anio_quema: 'Año quema',
    ganado_activo_poligono: 'Ganado activo en polígono', cabezas_poligono: 'Cabezas en polígono',
    conflictos_tenencia: 'Conflictos de tenencia', descripcion_conflictos: 'Descripción conflictos',
    restricciones_uso: 'Restricciones de uso', cuales_restricciones: 'Cuáles restricciones',
    otros_riesgos: 'Otros riesgos', observaciones_riesgos: 'Observaciones riesgos',
  }
  return MAP[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function displayValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—'
  if (typeof val === 'boolean') return val ? 'Sí' : 'No'
  if (Array.isArray(val)) return val.length ? val.join(', ') : '—'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function isPhotoUrl(key: string) {
  return key.endsWith('_url') && key.startsWith('foto')
}

// ─── Fila de campo ─────────────────────────────────────────────────────────────
function FieldRow({ field, value }: { field: string; value: unknown }) {
  if (value === null || value === undefined || value === '') return null

  const label = labelKey(field)
  const url = isPhotoUrl(field) && typeof value === 'string' ? value : null

  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 flex-shrink-0 w-36">{label}</span>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-[#0d7377] underline flex items-center gap-1">
          Ver foto <ExternalLink size={10} />
        </a>
      ) : (
        <span className="text-xs text-gray-800 font-medium flex-1">{displayValue(value)}</span>
      )}
    </div>
  )
}

// ─── Sección colapsable ────────────────────────────────────────────────────────
function Section({ title, data, defaultOpen = true }: {
  title: string
  data: Record<string, unknown>
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const entries = Object.entries(data).filter(([, v]) =>
    v !== null && v !== undefined && v !== '' &&
    !String(v).endsWith('_id') // skip foto IDs locales
  )

  if (!entries.length) return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3">
      <p className="text-xs font-bold text-gray-400">{title}</p>
      <p className="text-xs text-gray-300 mt-1">Sin datos registrados</p>
    </div>
  )

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3">
        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{title}</span>
        {open ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>}
      </button>
      {open && (
        <div className="px-4 pb-3">
          {entries.map(([k, v]) => <FieldRow key={k} field={k} value={v} />)}
        </div>
      )}
    </div>
  )
}

// ─── Viewer principal ──────────────────────────────────────────────────────────
export function CampoViewer() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const online   = useOnlineStatus()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [record, setRecord]   = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    supabase.schema('siembra').from('evaluaciones_campo')
      .select('*').eq('id', id).single()
      .then(({ data, error }) => {
        if (error) setErr(error.message)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        else setRecord(data as Record<string, any>)
        setLoading(false)
      })
  }, [id])

  if (!online) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500 px-8">
      <WifiOff size={40} className="text-gray-300"/>
      <p className="text-sm text-center">Sin internet. Conéctate para ver este registro.</p>
      <button onClick={() => navigate(-1)} className="text-[#0d7377] font-semibold text-sm">Volver</button>
    </div>
  )

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0d7377]"/>
    </div>
  )

  if (err || !record) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500 px-8">
      <p className="text-sm text-center text-red-500">{err ?? 'Registro no encontrado.'}</p>
      <button onClick={() => navigate(-1)} className="text-[#0d7377] font-semibold text-sm">Volver</button>
    </div>
  )

  const s1    = (record.seccion_1_data ?? {}) as Record<string, unknown>
  const s2    = (record.seccion_2_data ?? {}) as Record<string, unknown>
  const zonas = (record.zonas_data ?? []) as Array<{
    zona_numero: number
    cobertura: Record<string, unknown>
    suelo: Record<string, unknown>
    logistica: Record<string, unknown>
  }>
  const s6 = (record.seccion_6_data ?? {}) as Record<string, unknown>

  return (
    <div className="min-h-screen flex flex-col bg-[#f0fafa]">

      <header className="bg-[#0d7377] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1 rounded"><ArrowLeft size={20}/></button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{record.nombre_predio || '(Sin nombre)'}</p>
          <p className="text-xs opacity-60">
            Evaluación de campo · {record.created_by ?? '—'}
            {record.fecha_visita && ` · ${new Date(record.fecha_visita + 'T00:00:00').toLocaleDateString('es-CO')}`}
          </p>
        </div>
        <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">Solo lectura</span>
      </header>

      <main className="flex-1 px-4 py-4 space-y-3 pb-8">

        {Object.keys(s1).length > 0 && <Section title="§1 Identificación" data={s1} />}
        {Object.keys(s2).length > 0 && <Section title="§2 Cartografía Social" data={s2} />}

        {zonas.map(zona => (
          <div key={zona.zona_numero} className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 px-1">
              Zona {zona.zona_numero}
            </p>
            {Object.keys(zona.cobertura ?? {}).length > 0 &&
              <Section title="Cobertura vegetal" data={zona.cobertura} defaultOpen={false} />}
            {Object.keys(zona.suelo ?? {}).length > 0 &&
              <Section title="Suelo y topografía" data={zona.suelo} defaultOpen={false} />}
            {Object.keys(zona.logistica ?? {}).length > 0 &&
              <Section title="Logística y acceso" data={zona.logistica} defaultOpen={false} />}
          </div>
        ))}

        {Object.keys(s6).length > 0 && <Section title="§6 Riesgos y Restricciones" data={s6} defaultOpen={false} />}

        {/* Firmas */}
        {(record.firma_eval1_url || record.firma_eval2_url) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 space-y-3">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Firmas</p>
            {record.firma_eval1_url && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Evaluador 1</p>
                <img src={record.firma_eval1_url} alt="Firma evaluador 1"
                  className="h-16 border border-gray-200 rounded-lg bg-gray-50 object-contain" />
              </div>
            )}
            {record.firma_eval2_url && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Evaluador 2</p>
                <img src={record.firma_eval2_url} alt="Firma evaluador 2"
                  className="h-16 border border-gray-200 rounded-lg bg-gray-50 object-contain" />
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
