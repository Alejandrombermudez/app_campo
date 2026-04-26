import { SignatureCanvas } from '../../components/ui/SignatureCanvas'
import type { SeccionFirmas } from '../../types/evaluacion'

interface Props {
  data: Partial<SeccionFirmas>
  onChange: (d: Partial<SeccionFirmas>) => void
  evaluador1: string
  evaluador2: string
}

export function Step07({ data, onChange, evaluador1, evaluador2 }: Props) {
  const set = (k: keyof SeccionFirmas, v: string | null) => onChange({ ...data, [k]: v })

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-[#0d7377]">Firmas</h2>
      <p className="text-sm text-gray-500">
        Firmen en los recuadros. Use el dedo en pantalla táctil o el ratón en computador.
      </p>

      <SignatureCanvas
        label={`Evaluador 1${evaluador1 ? ` — ${evaluador1}` : ''}`}
        value={data.firma_evaluador1_dataurl ?? null}
        onChange={v => set('firma_evaluador1_dataurl', v)}
      />

      <SignatureCanvas
        label={`Evaluador 2${evaluador2 ? ` — ${evaluador2}` : ''} (opcional)`}
        value={data.firma_evaluador2_dataurl ?? null}
        onChange={v => set('firma_evaluador2_dataurl', v)}
      />

      <SignatureCanvas
        label="Propietario / Representante del predio"
        value={data.firma_propietario_dataurl ?? null}
        onChange={v => set('firma_propietario_dataurl', v)}
      />

      <div className="bg-[#0d7377]/5 border border-[#0d7377]/20 rounded-xl p-4 text-sm text-gray-600">
        <p>Al firmar, el propietario confirma que la información registrada es veraz y que autoriza
        el inicio de las actividades de restauración en las zonas evaluadas.</p>
      </div>
    </div>
  )
}
