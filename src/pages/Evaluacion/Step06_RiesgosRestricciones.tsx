import { YesNo } from '../../components/ui/YesNo'
import type { SeccionRiesgos } from '../../types/evaluacion'

interface Props {
  data: Partial<SeccionRiesgos>
  onChange: (d: Partial<SeccionRiesgos>) => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

export function Step06({ data, onChange }: Props) {
  const set = (k: keyof SeccionRiesgos, v: unknown) => onChange({ ...data, [k]: v })

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-[#0d7377]">§6 Riesgos y Restricciones</h2>

      <Field label="¿Ha habido quemas recientes?">
        <YesNo val={data.quemas_recientes ?? null} onChange={v => set('quemas_recientes', v)} />
      </Field>

      {data.quemas_recientes && (
        <Field label="Año de la última quema">
          <input
            type="text"
            placeholder="Ej: 2024"
            value={data.anio_quema ?? ''}
            onChange={e => set('anio_quema', e.target.value)}
          />
        </Field>
      )}

      <Field label="¿Hay ganado activo en el polígono?">
        <YesNo val={data.ganado_activo_poligono ?? null} onChange={v => set('ganado_activo_poligono', v)} />
      </Field>

      {data.ganado_activo_poligono && (
        <Field label="Número de cabezas en el polígono">
          <input
            type="number"
            min={0}
            placeholder="N° de cabezas"
            value={data.cabezas_poligono ?? ''}
            onChange={e => set('cabezas_poligono', e.target.value ? parseInt(e.target.value) : null)}
          />
        </Field>
      )}

      <Field label="¿Existen conflictos de tenencia?">
        <YesNo val={data.conflictos_tenencia ?? null} onChange={v => set('conflictos_tenencia', v)} />
      </Field>

      {data.conflictos_tenencia && (
        <Field label="Descripción de los conflictos">
          <textarea
            rows={2}
            placeholder="Describir brevemente el tipo de conflicto…"
            value={data.descripcion_conflictos ?? ''}
            onChange={e => set('descripcion_conflictos', e.target.value)}
          />
        </Field>
      )}

      <Field label="¿Hay restricciones de uso del predio?">
        <YesNo val={data.restricciones_uso ?? null} onChange={v => set('restricciones_uso', v)} />
      </Field>

      {data.restricciones_uso && (
        <Field label="¿Cuáles restricciones?">
          <textarea
            rows={2}
            placeholder="Describir las restricciones…"
            value={data.cuales_restricciones ?? ''}
            onChange={e => set('cuales_restricciones', e.target.value)}
          />
        </Field>
      )}

      <Field label="Otros riesgos identificados">
        <textarea
          rows={3}
          placeholder="Inundaciones, deslizamientos, conflictos vecinales, etc."
          value={data.otros_riesgos ?? ''}
          onChange={e => set('otros_riesgos', e.target.value)}
        />
      </Field>

      <Field label="Observaciones generales de riesgos">
        <textarea
          rows={3}
          placeholder="Observaciones finales sobre el contexto de riesgos…"
          value={data.observaciones_riesgos ?? ''}
          onChange={e => set('observaciones_riesgos', e.target.value)}
        />
      </Field>
    </div>
  )
}
