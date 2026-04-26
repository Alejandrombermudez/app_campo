import { YesNo } from '../../components/ui/YesNo'
import type { SeccionIdentificacion } from '../../types/evaluacion'

interface Props {
  data: Partial<SeccionIdentificacion>
  onChange: (d: Partial<SeccionIdentificacion>) => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

export function Step01({ data, onChange }: Props) {
  const set = (k: keyof SeccionIdentificacion, v: unknown) => onChange({ ...data, [k]: v })

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-[#0d7377]">§1 Identificación</h2>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Código formato">
          <input type="text" value={data.codigo_formato ?? 'AE-CAMPO-001'} readOnly className="bg-gray-50 text-gray-400" />
        </Field>
        <Field label="Versión">
          <input type="text" value={data.version ?? '1.0'} readOnly className="bg-gray-50 text-gray-400" />
        </Field>
      </div>

      <Field label="Fecha de visita">
        <input type="date" value={data.fecha_visita ?? ''} onChange={e => set('fecha_visita', e.target.value)} />
      </Field>

      <Field label="Evaluador 1">
        <input type="text" placeholder="Nombre completo" value={data.evaluador_1 ?? ''} onChange={e => set('evaluador_1', e.target.value)} />
      </Field>

      <Field label="Evaluador 2 (opcional)">
        <input type="text" placeholder="Nombre completo" value={data.evaluador_2 ?? ''} onChange={e => set('evaluador_2', e.target.value)} />
      </Field>

      <Field label="Municipio">
        <input type="text" placeholder="Municipio" value={data.municipio ?? ''} onChange={e => set('municipio', e.target.value)} />
      </Field>

      <Field label="Vereda">
        <input type="text" placeholder="Vereda" value={data.vereda ?? ''} onChange={e => set('vereda', e.target.value)} />
      </Field>

      <Field label="Nombre del predio">
        <input type="text" placeholder="Nombre de la finca" value={data.nombre_predio ?? ''} onChange={e => set('nombre_predio', e.target.value)} />
      </Field>

      <Field label="Propietario / tenedor">
        <input type="text" placeholder="Nombre completo" value={data.propietario_tenedor ?? ''} onChange={e => set('propietario_tenedor', e.target.value)} />
      </Field>

      <Field label="Código de predio">
        <input type="text" placeholder="Ej: CAQ-001" value={data.codigo_predio ?? ''} onChange={e => set('codigo_predio', e.target.value)} />
      </Field>

      <Field label="Número de zonas definidas">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="number"
            min={1}
            max={10}
            value={data.num_zonas ?? 1}
            onChange={e => set('num_zonas', Math.max(1, parseInt(e.target.value) || 1))}
            className="w-24"
          />
          <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 rounded-lg px-3 py-1">
            ⚠ Define cuántas veces se repiten §3, §4 y §5
          </span>
        </div>
      </Field>

      <Field label="¿Hay señal celular en el predio?">
        <YesNo val={data.senal_celular ?? null} onChange={v => set('senal_celular', v)} />
      </Field>

      {data.senal_celular && (
        <Field label="Operador celular">
          <input type="text" placeholder="Claro / Movistar / Tigo / WOM…" value={data.operador_celular ?? ''} onChange={e => set('operador_celular', e.target.value)} />
        </Field>
      )}

      <Field label="Área de las zonas evaluadas (ha)">
        <input type="number" step="0.1" min={0} placeholder="0.0" value={data.area_zonas_ha ?? ''} onChange={e => set('area_zonas_ha', e.target.value ? parseFloat(e.target.value) : null)} />
      </Field>

      <Field label="Contacto del propietario">
        <input type="tel" placeholder="Teléfono / WhatsApp" value={data.contacto_propietario ?? ''} onChange={e => set('contacto_propietario', e.target.value)} />
      </Field>

      <Field label="Tiempo desde vía pública hasta el predio">
        <input type="text" placeholder="Ej: 30 min en moto" value={data.tiempo_desde_via ?? ''} onChange={e => set('tiempo_desde_via', e.target.value)} />
      </Field>
    </div>
  )
}
