import { RadioGrp } from '../../components/ui/RadioGrp'
import { ChkGroup } from '../../components/ui/ChkGroup'
import { PhotoCapture } from '../../components/ui/PhotoCapture'
import type { SeccionLogistica } from '../../types/evaluacion'

interface Props {
  zona: number
  localEvaluacionId: string
  data: Partial<SeccionLogistica>
  onChange: (d: Partial<SeccionLogistica>) => void
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

export function Step05({ zona, localEvaluacionId, data, onChange }: Props) {
  const set = (k: keyof SeccionLogistica, v: unknown) => onChange({ ...data, [k]: v })

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-[#0d7377]">§5 Logística y Acceso — Zona {zona}</h2>

      {/* ── 1. Punto de acceso / vía pública + FOTO ───────────────────────── */}
      <Field label="Punto de acceso más cercano (vía pública)">
        <RadioGrp
          opts={['Vía pavimentada', 'Destapada transitable', 'Camino en mal estado', 'Sin vía vehicular']}
          val={data.tipo_via ?? ''}
          onChange={v => set('tipo_via', v)}
          cols={2}
        />
      </Field>

      <div className="bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Foto — Punto de acceso / vía</p>
        <PhotoCapture
          fieldKey={`zona_${zona}_via`}
          localEvaluacionId={localEvaluacionId}
          currentPhotoId={data.foto_via_id ?? null}
          onCapture={id => set('foto_via_id', id)}
          onRemove={() => set('foto_via_id', null)}
        />
      </div>

      {/* ── 2. Medio de acceso ────────────────────────────────────────────── */}
      <Field label="Medio de acceso a las zonas desde la finca">
        <ChkGroup
          opts={['Vehículo', 'Moto', 'Mula', 'A pie']}
          val={data.medio_acceso_zonas ?? []}
          onChange={v => set('medio_acceso_zonas', v)}
          cols={2}
        />
      </Field>

      {/* ── 3. Tiempo desde predio hasta zona ─────────────────────────────── */}
      <Field label="Tiempo desde el predio hasta la zona de intervención">
        <input
          type="text"
          placeholder="Ej: 25 min a pie"
          value={data.tiempo_predio_zona ?? ''}
          onChange={e => set('tiempo_predio_zona', e.target.value)}
        />
      </Field>

      {/* ── 4. Condición del camino ───────────────────────────────────────── */}
      <Field label="Condición del camino al polígono">
        <RadioGrp
          opts={['Transitable todo el año', 'Solo en verano', 'Difícil en invierno', 'Intransitable en invierno']}
          val={data.condicion_camino ?? ''}
          onChange={v => set('condicion_camino', v)}
          cols={2}
        />
      </Field>

      {/* ── 5. Lugar seguro para material ─────────────────────────────────── */}
      <Field label="Lugar seguro para dejar material la noche anterior">
        <RadioGrp
          opts={['En la finca', 'En vereda cercana', 'No disponible']}
          val={data.lugar_deposito_material ?? ''}
          onChange={v => set('lugar_deposito_material', v)}
          cols={2}
        />
      </Field>

      {/* ── 6. Complejidad logística global ───────────────────────────────── */}
      <Field label="Complejidad logística global del acceso">
        <RadioGrp
          opts={['Baja', 'Media', 'Alta', 'Muy alta']}
          val={data.complejidad_acceso ?? ''}
          onChange={v => set('complejidad_acceso', v)}
          cols={4}
        />
      </Field>

      {/* ── 7. Descripción de la ruta ─────────────────────────────────────── */}
      <Field label="Descripción de la ruta de acceso" hint="Indicaciones detalladas para llegar a la zona, incluyendo combinación de medios si aplica…">
        <textarea
          rows={4}
          placeholder="Ej: Tomar la vía principal hacia el municipio, a 3 km doblar a la derecha por camino destapado, luego 20 min a pie por el caño…"
          value={data.descripcion_ruta ?? ''}
          onChange={e => set('descripcion_ruta', e.target.value)}
        />
      </Field>
    </div>
  )
}
