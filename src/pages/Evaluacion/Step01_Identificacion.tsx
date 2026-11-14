import { YesNo } from '../../components/ui/YesNo'
import type { SeccionIdentificacion } from '../../types/evaluacion'

interface Props {
  data: Partial<SeccionIdentificacion>
  onChange: (d: Partial<SeccionIdentificacion>) => void
  /** Quien evalúa: el nombre con que entra el celular. */
  evaluador: string
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
// geo.zonas respectivamente. Desde el 2026-10-21 tampoco evaluador 1 y 2 ni el
// código del predio (pedido del usuario): quien evalúa es quien entra al
// celular y el código viene de jurídica. Solo se muestran.
export function Step01({ data, onChange, evaluador }: Props) {
  const set = (k: keyof SeccionIdentificacion, v: unknown) => onChange({ ...data, [k]: v })

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-bosque">§1 Identificación</h2>

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

      <div className="grid grid-cols-2 gap-4">
        <Field label="Quien evalúa">
          <input type="text" value={data.evaluador_1 || evaluador} readOnly className="bg-gray-50 text-gray-600" />
        </Field>
        <Field label="Código del predio (jurídica)">
          <input type="text" value={data.codigo_predio || 'Sin código en jurídica'} readOnly className="bg-gray-50 text-gray-600" />
        </Field>
      </div>

      <Field label="¿Hay señal celular en el predio?">
        <YesNo val={data.senal_celular ?? null} onChange={v => set('senal_celular', v)} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Centro urbano más cercano">
          <input type="text" placeholder="Ej: Morelia" value={data.centro_urbano ?? ''} onChange={e => set('centro_urbano', e.target.value)} />
        </Field>
        <Field label="Tiempo desde ahí hasta el predio">
          <input type="text" placeholder="Ej: 1 h en moto" value={data.tiempo_desde_centro_urbano ?? ''} onChange={e => set('tiempo_desde_centro_urbano', e.target.value)} />
        </Field>
      </div>
    </div>
  )
}
