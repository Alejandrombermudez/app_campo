import { YesNo } from '../../components/ui/YesNo'
import { ChkGroup } from '../../components/ui/ChkGroup'
import { RadioGrp } from '../../components/ui/RadioGrp'
import type { PredioRecord } from '../../types/predio'

type P1Fields = Pick<PredioRecord,
  | 'nombre_predio' | 'municipio' | 'vereda' | 'fecha'
  | 'nombre_propietario' | 'contacto_propietario' | 'senal_disponible'
  | 'evaluador_1' | 'evaluador_2' | 'codigo_predio' | 'num_zonas'
  | 'area_zonas_ha' | 'tiempo_desde_via' | 'operador_celular'
  | 'encuesta_no' | 'tipo_encuestado' | 'encuestador' | 'departamento'
  | 'estrato_paisaje' | 'latitud' | 'longitud' | 'altitud_msnm'
  | 'anio_adquisicion' | 'distancia_cabecera_km'
  | 'tipo_via' | 'tipo_acceso_predio' | 'servicios_domiciliarios' | 'fuente_agua'
>

interface Props {
  data: P1Fields
  onChange: (d: Partial<PredioRecord>) => void
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      {children}
    </div>
  )
}

function SectionHead({ title, color }: { title: string; color: 'campo' | 'predial' | 'general' }) {
  const cls = color === 'campo'
    ? 'text-[#0d7377] border-[#0d7377]/30 bg-[#0d7377]/5'
    : color === 'predial'
    ? 'text-emerald-700 border-emerald-300 bg-emerald-50'
    : 'text-gray-600 border-gray-200 bg-gray-50'
  return (
    <div className={`${cls} border rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-widest`}>
      {title}
    </div>
  )
}

export function PStep01({ data, onChange }: Props) {
  const s = <K extends keyof PredioRecord>(k: K, v: PredioRecord[K]) => onChange({ [k]: v } as Partial<PredioRecord>)

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-[#0d7377]">§1 Identificación del Predio</h2>

      {/* ── DATOS GENERALES (campos comunes) ─────────────────────────────── */}
      <SectionHead title="Datos generales" color="general" />

      <Field label="Fecha">
        <input type="date" value={data.fecha} onChange={e => onChange({
          fecha: e.target.value,
        })} />
      </Field>

      <Field label="Nombre del predio / finca">
        <input type="text" placeholder="Nombre de la finca" value={data.nombre_predio}
          onChange={e => onChange({ nombre_predio: e.target.value })} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Municipio">
          <input type="text" placeholder="Municipio" value={data.municipio}
            onChange={e => onChange({ municipio: e.target.value })} />
        </Field>
        <Field label="Vereda">
          <input type="text" placeholder="Vereda" value={data.vereda}
            onChange={e => onChange({ vereda: e.target.value })} />
        </Field>
      </div>

      <Field label="Nombre del propietario / tenedor">
        <input type="text" placeholder="Nombre completo" value={data.nombre_propietario}
          onChange={e => onChange({ nombre_propietario: e.target.value })} />
      </Field>

      <Field label="Contacto (teléfono / WhatsApp)">
        <input type="tel" placeholder="+57 300..." value={data.contacto_propietario}
          onChange={e => onChange({ contacto_propietario: e.target.value })} />
      </Field>

      <Field label="¿Hay señal de comunicación en el predio?">
        <YesNo val={data.senal_disponible ?? null}
          onChange={v => onChange({ senal_disponible: v })} />
      </Field>
      {data.senal_disponible && (
        <Field label="Operador celular">
          <input type="text" placeholder="Claro / Movistar / Tigo / WOM…" value={data.operador_celular}
            onChange={e => onChange({ operador_celular: e.target.value })} />
        </Field>
      )}

      {/* ── EVALUACIÓN DE CAMPO ──────────────────────────────────────────── */}
      <SectionHead title="Evaluación de campo — AE-CAMPO-001" color="campo" />

      <div className="grid grid-cols-2 gap-4">
        <Field label="Evaluador 1">
          <input type="text" placeholder="Nombre completo" value={data.evaluador_1}
            onChange={e => onChange({ evaluador_1: e.target.value })} />
        </Field>
        <Field label="Evaluador 2 (opcional)">
          <input type="text" placeholder="Nombre completo" value={data.evaluador_2}
            onChange={e => onChange({ evaluador_2: e.target.value })} />
        </Field>
      </div>

      <Field label="Código de predio">
        <input type="text" placeholder="Ej: CAQ-001" value={data.codigo_predio}
          onChange={e => onChange({ codigo_predio: e.target.value })} />
      </Field>

      <Field label="Número de zonas definidas"
        hint="Define cuántas veces se repiten las secciones de Cobertura, Suelo y Logística">
        <select
          value={data.num_zonas}
          onChange={e => s('num_zonas', parseInt(e.target.value))}
          className="w-28"
        >
          {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Área total de zonas (ha)">
          <input type="number" step="0.1" min={0} placeholder="0.0" value={data.area_zonas_ha}
            onChange={e => onChange({ area_zonas_ha: e.target.value })} />
        </Field>
        <Field label="Tiempo desde vía pública">
          <input type="text" placeholder="Ej: 30 min moto" value={data.tiempo_desde_via}
            onChange={e => onChange({ tiempo_desde_via: e.target.value })} />
        </Field>
      </div>

      {/* ── ENCUESTA PREDIAL ─────────────────────────────────────────────── */}
      <SectionHead title="Encuesta predial — Caracterización" color="predial" />

      <div className="grid grid-cols-2 gap-4">
        <Field label="Encuesta No.">
          <input type="text" placeholder="001" value={data.encuesta_no}
            onChange={e => onChange({ encuesta_no: e.target.value })} />
        </Field>
        <Field label="Encuestador">
          <input type="text" placeholder="Nombre" value={data.encuestador}
            onChange={e => onChange({ encuestador: e.target.value })} />
        </Field>
      </div>

      <Field label="Tipo de respondente">
        <RadioGrp
          opts={['Propietario','Arrendatario','Mayordomo','Trabajador']}
          val={data.tipo_encuestado}
          onChange={v => onChange({ tipo_encuestado: v })}
          cols={2}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Departamento">
          <input type="text" value={data.departamento || 'Caquetá'} readOnly
            className="bg-gray-50 text-gray-400" />
        </Field>
        <Field label="Estrato de paisaje">
          <select value={data.estrato_paisaje}
            onChange={e => onChange({ estrato_paisaje: e.target.value })}>
            <option value="">—</option>
            {['Sabana','Vega','Tierra firme alta','Tierra firme media','Tierra firme baja']
              .map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Latitud (N)">
          <input type="text" placeholder="0.0000" value={data.latitud}
            onChange={e => onChange({ latitud: e.target.value })} />
        </Field>
        <Field label="Longitud (W)">
          <input type="text" placeholder="-75.0000" value={data.longitud}
            onChange={e => onChange({ longitud: e.target.value })} />
        </Field>
        <Field label="Altitud (msnm)">
          <input type="number" placeholder="0" value={data.altitud_msnm ?? ''}
            onChange={e => onChange({ altitud_msnm: e.target.value ? +e.target.value : null })} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Año de adquisición">
          <input type="number" placeholder="2000" value={data.anio_adquisicion ?? ''}
            onChange={e => onChange({ anio_adquisicion: e.target.value ? +e.target.value : null })} />
        </Field>
        <Field label="Dist. cabecera (km)">
          <input type="number" step="0.1" placeholder="0" value={data.distancia_cabecera_km ?? ''}
            onChange={e => onChange({ distancia_cabecera_km: e.target.value ? +e.target.value : null })} />
        </Field>
      </div>

      <Field label="Tipo de vía de acceso">
        <ChkGroup
          opts={['Pavimentada','Sin pavimentar','Río','Herradura']}
          val={data.tipo_via}
          onChange={v => onChange({ tipo_via: v })}
          cols={2}
        />
      </Field>

      <Field label="Medio de acceso al predio">
        <ChkGroup
          opts={['Carro','Moto','Caballo','Pie','Canoa']}
          val={data.tipo_acceso_predio}
          onChange={v => onChange({ tipo_acceso_predio: v })}
          cols={3}
        />
      </Field>

      <Field label="Servicios domiciliarios">
        <ChkGroup
          opts={['Energía eléctrica','Energía solar','Planta gasolina','No tiene']}
          val={data.servicios_domiciliarios}
          onChange={v => onChange({ servicios_domiciliarios: v })}
          cols={2}
        />
      </Field>

      <Field label="Fuente de agua">
        <ChkGroup
          opts={['Acueducto','Reservorios','Cuerpos de agua naturales','Pozo','No tiene']}
          val={data.fuente_agua}
          onChange={v => onChange({ fuente_agua: v })}
          cols={2}
        />
      </Field>
    </div>
  )
}
