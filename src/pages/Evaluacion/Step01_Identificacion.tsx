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

// Predio/propietario/municipio/vereda y las zonas (num_zonas/área) NO se
// preguntan aquí: ya vienen de Jurídica+SIG (ver ficha de la familia) y de
// geo.zonas respectivamente. Esta sección solo guarda metadatos de la visita.
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

      <Field label="Código de predio">
        <input type="text" placeholder="Ej: CAQ-001" value={data.codigo_predio ?? ''} onChange={e => set('codigo_predio', e.target.value)} />
      </Field>

      <Field label="¿Hay señal celular en el predio?">
        <YesNo val={data.senal_celular ?? null} onChange={v => set('senal_celular', v)} />
      </Field>

      {data.senal_celular && (
        <Field label="Operador celular">
          <input type="text" placeholder="Claro / Movistar / Tigo / WOM…" value={data.operador_celular ?? ''} onChange={e => set('operador_celular', e.target.value)} />
        </Field>
      )}

      <Field label="Tiempo desde vía pública hasta el predio">
        <input type="text" placeholder="Ej: 30 min en moto" value={data.tiempo_desde_via ?? ''} onChange={e => set('tiempo_desde_via', e.target.value)} />
      </Field>
    </div>
  )
}
