import { RadioGrp } from '../../components/ui/RadioGrp'
import { YesNo } from '../../components/ui/YesNo'
import type { SeccionCartografia } from '../../types/evaluacion'

interface Props {
  data: Partial<SeccionCartografia>
  onChange: (d: Partial<SeccionCartografia>) => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

const disposicionOpts = ['Muy favorable', 'Favorable', 'Neutro', 'Escéptico', 'No acepta']

export function Step02({ data, onChange }: Props) {
  const set = (k: keyof SeccionCartografia, v: unknown) => onChange({ ...data, [k]: v })

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-[#0d7377]">§2 Cartografía Social</h2>

      <Field label="Disposición del propietario">
        <RadioGrp
          opts={disposicionOpts}
          val={data.disposicion_propietario ?? ''}
          onChange={v => set('disposicion_propietario', v)}
          cols={2}
        />
      </Field>

      <Field label="Ajustes al polígono">
        <textarea
          rows={3}
          placeholder="Describir ajustes necesarios al polígono…"
          value={data.ajustes_poligono ?? ''}
          onChange={e => set('ajustes_poligono', e.target.value)}
        />
      </Field>

      <Field label="Observaciones sociales">
        <textarea
          rows={3}
          placeholder="Observaciones de contexto social o comunitario…"
          value={data.observaciones_sociales ?? ''}
          onChange={e => set('observaciones_sociales', e.target.value)}
        />
      </Field>

      <Field label="¿Hay mano de obra disponible en la zona?">
        <YesNo val={data.mano_obra_disponible ?? null} onChange={v => set('mano_obra_disponible', v)} />
      </Field>

      <Field label="¿El propietario tiene experiencia en restauración?">
        <YesNo val={data.experiencia_restauracion ?? null} onChange={v => set('experiencia_restauracion', v)} />
      </Field>
    </div>
  )
}
