import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp, WifiOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useOnlineStatus } from '../../lib/useOnlineStatus'

// ─── Utilidades ────────────────────────────────────────────────────────────────
function labelKey(key: string): string {
  const MAP: Record<string, string> = {
    encuesta_no: 'Nº encuesta', fecha_encuesta: 'Fecha encuesta', encuestador: 'Encuestador',
    tipo_encuestado: 'Tipo encuestado', nombre_propietario: 'Nombre propietario',
    contacto: 'Contacto', nombre_finca: 'Nombre finca', departamento: 'Departamento',
    municipio: 'Municipio', vereda: 'Vereda', estrato_paisaje: 'Estrato paisaje',
    latitud: 'Latitud', longitud: 'Longitud', altitud_msnm: 'Altitud (msnm)',
    anio_adquisicion: 'Año adquisición', distancia_cabecera_km: 'Distancia cabecera (km)',
    tipo_via: 'Tipo de vía', tipo_acceso_predio: 'Tipo acceso predio',
    servicios_domiciliarios: 'Servicios domiciliarios', fuente_agua: 'Fuente de agua',
    senal_telefonica: 'Señal telefónica',
    material_techo: 'Material techo', material_paredes: 'Material paredes',
    material_piso: 'Material piso', num_habitaciones: 'Nº habitaciones',
    personas_vivienda: 'Personas en vivienda', tipo_cocina: 'Tipo cocina',
    tipo_bano: 'Tipo baño', disposicion_excretas: 'Disposición excretas',
    disposicion_aguas_servidas: 'Aguas servidas', manejo_basuras: 'Manejo basuras',
    poblacion_tendencia: 'Tendencia población', acceso_salud: 'Acceso a salud',
    regimen_salud: 'Régimen salud', puesto_salud: 'Puesto de salud',
    acceso_educacion: 'Acceso educación', distancia_educacion_km: 'Distancia educación (km)',
    tiempo_llegada_region: 'Tiempo llegada región', razon_llegada: 'Razón de llegada',
    ha_total: 'Hectáreas total', valor_comercial_ha: 'Valor comercial ($/ha)',
    tendencia_area: 'Tendencia área', cambio_area_ha: 'Cambio área (ha)',
    intencion_vender: 'Intención de vender', causas_venta: 'Causas venta',
    medio_transporte_produccion: 'Transporte producción', transporte_propio: 'Transporte propio',
    valor_transporte: 'Valor transporte', problemas_mercado: 'Problemas mercado',
    nivel_ingresos: 'Nivel de ingresos',
    tiene_ganaderia: 'Tiene ganadería', tipo_tenencia_ganado: 'Tenencia ganado',
    orientacion_ganaderia: 'Orientación ganadería', num_cabezas_ganado: 'Nº cabezas',
    ha_ganaderia: 'Hectáreas ganadería', tipos_pasto: 'Tipos de pasto',
    litros_leche_dia: 'Litros leche/día', tanque_enfriamiento: 'Tanque enfriamiento',
    destino_leche: 'Destino leche', precio_leche_litro: 'Precio leche ($/L)',
    sistema_alimentacion_ganado: 'Sistema alimentación', especies_forrajeras: 'Especies forrajeras',
    interes_ganaderia_regenerativa: 'Interés ganadería regenerativa',
    pastoreo_rotacional: 'Pastoreo rotacional', diversificacion_forrajera: 'Diversificación forrajera',
    cercas_vivas: 'Cercas vivas', sistemas_silvopastoriles: 'Silvopastoriles',
    instalaciones_maquinaria: 'Instalaciones / maquinaria', tiene_tractor: 'Tiene tractor',
    tiene_camion: 'Tiene camión', manejo_suelo_fertilizacion: 'Manejo suelo / fertilización',
    tipo_fertilizacion: 'Tipo fertilización', cobertura_arborea: 'Cobertura arbórea',
    practica_podas: 'Practica podas', practica_raleo: 'Practica raleo',
    control_malezas: 'Control malezas', manejo_agua_cultivo: 'Manejo agua cultivo',
    problemas_manejo: 'Problemas manejo', lleva_registros_productividad: 'Lleva registros',
    interes_capacitacion: 'Interés capacitación', temas_capacitacion: 'Temas capacitación',
    aprovecha_bosque: 'Aprovecha bosque', productos_forestales: 'Productos forestales',
    capacitacion_ambiente: 'Capacitación ambiental', entidad_capacitacion: 'Entidad capacitación',
    especies_bosque_predio: 'Especies bosque', especies_fauna_predio: 'Especies fauna',
    estudio_academico: 'Estudio académico', disminucion_especies: 'Disminución especies',
    especies_afectadas: 'Especies afectadas', cambios_caudal: 'Cambios en caudal',
    cambio_cobertura_ha: 'Cambio cobertura (ha)', causa_cambio_cobertura: 'Causa cambio cobertura',
    problemas_agropecuarios: 'Problemas agropecuarios',
    programas_gubernamentales: 'Programas gubernamentales', beneficios_programas: 'Beneficios programas',
    impacto_programa: 'Impacto programa', opinion_productores: 'Opinión productores',
    aliado_cooperativa: 'Aliado cooperativa', nombre_cooperativa: 'Nombre cooperativa',
    beneficio_cooperativa: 'Beneficio cooperativa', calificacion_gremios: 'Calificación gremios',
    observaciones_generales: 'Observaciones generales',
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

// ─── Fila campo ────────────────────────────────────────────────────────────────
function FieldRow({ field, value }: { field: string; value: unknown }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 flex-shrink-0 w-40">{labelKey(field)}</span>
      <span className="text-xs text-gray-800 font-medium flex-1 break-words">{displayValue(value)}</span>
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
  const entries = Object.entries(data).filter(([k, v]) => {
    // Filtrar sub-objetos complejos (ej: equinos, porcinos) — los mostramos aparte
    if (v === null || v === undefined || v === '') return false
    if (typeof v === 'object' && !Array.isArray(v) && k !== 'miembros') return false
    return true
  })

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

// ─── Tabla de cultivos ─────────────────────────────────────────────────────────
function CultivosTable({ cultivos }: { cultivos: Array<Record<string, string>> }) {
  const filled = cultivos.filter(c => c.cultivo && (c.area_ha || c.rendimiento || c.destino))
  if (!filled.length) return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3">
      <p className="text-xs font-bold text-gray-400">§6A Cultivos</p>
      <p className="text-xs text-gray-300 mt-1">Sin datos registrados</p>
    </div>
  )
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50">
        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">§6A Cultivos</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              {['Cultivo','Área (ha)','Año siembra','Rendimiento','Destino'].map(h => (
                <th key={h} className="text-left px-3 py-2 text-gray-500 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filled.map((c, i) => (
              <tr key={i} className="border-t border-gray-50">
                <td className="px-3 py-2 font-medium text-gray-800">{c.cultivo || '—'}</td>
                <td className="px-3 py-2 text-gray-600">{c.area_ha || '—'}</td>
                <td className="px-3 py-2 text-gray-600">{c.anio_siembra || '—'}</td>
                <td className="px-3 py-2 text-gray-600">{c.rendimiento || '—'}</td>
                <td className="px-3 py-2 text-gray-600">{c.destino || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Tabla de familia ──────────────────────────────────────────────────────────
function MiembrosTable({ miembros }: { miembros: Array<Record<string, string>> }) {
  if (!miembros?.length) return null
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50">
        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Núcleo familiar</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              {['Parentesco','Edad','Sexo','Nivel estudio','Días finca'].map(h => (
                <th key={h} className="text-left px-3 py-2 text-gray-500 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {miembros.map((m, i) => (
              <tr key={i} className="border-t border-gray-50">
                <td className="px-3 py-2 text-gray-800">{m.parentesco || '—'}</td>
                <td className="px-3 py-2 text-gray-600">{m.edad || '—'}</td>
                <td className="px-3 py-2 text-gray-600">{m.sexo || '—'}</td>
                <td className="px-3 py-2 text-gray-600">{m.nivel_estudio || '—'}</td>
                <td className="px-3 py-2 text-gray-600">{m.dias_finca || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Viewer principal ──────────────────────────────────────────────────────────
export function PredialViewer() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const online   = useOnlineStatus()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [record,  setRecord]  = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    supabase.schema('siembra').from('familias')
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

  const sg   = (record.sec_general   ?? {}) as Record<string, unknown>
  const sv   = (record.sec_vivienda  ?? {}) as Record<string, unknown>
  const sf   = (record.sec_familia   ?? {}) as Record<string, unknown>
  const se   = (record.sec_economia  ?? {}) as Record<string, unknown>
  const sc   = (record.sec_cultivos  ?? []) as Array<Record<string, string>>
  const sgan = (record.sec_ganaderia ?? {}) as Record<string, unknown>
  const st   = (record.sec_tecnologia ?? {}) as Record<string, unknown>
  const sb   = (record.sec_bosque    ?? {}) as Record<string, unknown>

  const miembros = (sf.miembros ?? []) as Array<Record<string, string>>
  const sfSinMiembros = Object.fromEntries(Object.entries(sf).filter(([k]) => k !== 'miembros'))

  return (
    <div className="min-h-screen flex flex-col bg-[#f0fafa]">

      <header className="bg-emerald-700 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1 rounded"><ArrowLeft size={20}/></button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">
            {record.nombre_propietario || (sg as Record<string,unknown>).nombre_propietario as string || '(Sin nombre)'}
          </p>
          <p className="text-xs opacity-60">
            Encuesta predial · {record.created_by ?? '—'}
            {record.fecha_encuesta && ` · ${new Date(record.fecha_encuesta + 'T00:00:00').toLocaleDateString('es-CO')}`}
          </p>
        </div>
        <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">Solo lectura</span>
      </header>

      <main className="flex-1 px-4 py-4 space-y-3 pb-8">
        {Object.keys(sg).length > 0 && <Section title="§1-2 General y predio" data={sg} />}
        {Object.keys(sv).length > 0 && <Section title="§3 Vivienda" data={sv} defaultOpen={false} />}
        {Object.keys(sfSinMiembros).length > 0 && <Section title="§4 Núcleo familiar" data={sfSinMiembros} defaultOpen={false} />}
        {miembros.length > 0 && <MiembrosTable miembros={miembros} />}
        {Object.keys(se).length > 0 && <Section title="§5 Economía" data={se} defaultOpen={false} />}
        {sc.length > 0 && <CultivosTable cultivos={sc} />}
        {Object.keys(sgan).length > 0 && <Section title="§6B Ganadería" data={sgan} defaultOpen={false} />}
        {Object.keys(st).length > 0 && <Section title="§7 Tecnología" data={st} defaultOpen={false} />}
        {Object.keys(sb).length > 0 && <Section title="§8-9 Bosque y Relaciones" data={sb} defaultOpen={false} />}
      </main>
    </div>
  )
}
