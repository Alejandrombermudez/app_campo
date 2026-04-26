import { RadioGrp } from '../../components/ui/RadioGrp'
import { PhotoCapture } from '../../components/ui/PhotoCapture'
import type { SeccionSuelo } from '../../types/evaluacion'

interface Props {
  zona: number
  localEvaluacionId: string
  data: Partial<SeccionSuelo>
  onChange: (d: Partial<SeccionSuelo>) => void
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

// Mapa textura/pendiente → imagen de referencia
const REF: Record<string, { image: string; label: string }> = {
  Arcilloso: { image: '/ref-images/suelo-arcilloso.jpeg', label: 'Referencia: suelo arcilloso' },
  Arenoso:   { image: '/ref-images/suelo-arenoso.jpeg',  label: 'Referencia: suelo arenoso'   },
  Plano:     { image: '/ref-images/plano.webp',          label: 'Referencia: terreno plano'    },
  Lomerío:   { image: '/ref-images/lomerio.webp',        label: 'Referencia: lomerío'          },
  Montaña:   { image: '/ref-images/montana.webp',        label: 'Referencia: montaña'          },
}

export function Step04({ zona, localEvaluacionId, data, onChange }: Props) {
  const set = (k: keyof SeccionSuelo, v: unknown) => onChange({ ...data, [k]: v })

  const texRef  = data.textura_suelo ? REF[data.textura_suelo]  : undefined
  const pendRef = data.pendiente     ? REF[data.pendiente]      : undefined

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-[#0d7377]">§4 Suelo y Topografía — Zona {zona}</h2>

      {/* ── 1. Textura del suelo ──────────────────────────────────────────── */}
      <Field label="Textura del suelo (al tacto)" hint="Selecciona la opción y toca 'Ver referencia' para ver un ejemplo visual">
        <RadioGrp
          opts={['Arcilloso', 'Arenoso']}
          val={data.textura_suelo ?? ''}
          onChange={v => set('textura_suelo', v)}
          cols={2}
        />
      </Field>

      {/* Imagen de referencia (según selección) + FOTO del suelo real */}
      <div className="bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Foto — Textura del suelo</p>
        <PhotoCapture
          fieldKey={`zona_${zona}_textura`}
          localEvaluacionId={localEvaluacionId}
          currentPhotoId={data.foto_textura_id ?? null}
          onCapture={id => set('foto_textura_id', id)}
          onRemove={() => set('foto_textura_id', null)}
          referenceImage={texRef?.image}
          referenceLabel={texRef?.label}
        />
      </div>

      {/* ── 2. Drenaje superficial ────────────────────────────────────────── */}
      <Field label="Drenaje superficial">
        <RadioGrp
          opts={['Bueno', 'Pobre / inundable']}
          val={data.drenaje_superficial ?? ''}
          onChange={v => set('drenaje_superficial', v)}
          cols={2}
        />
      </Field>

      {/* FOTO drenaje — sin imagen de referencia */}
      <div className="bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Foto — Drenaje superficial</p>
        <PhotoCapture
          fieldKey={`zona_${zona}_drenaje`}
          localEvaluacionId={localEvaluacionId}
          currentPhotoId={data.foto_drenaje_id ?? null}
          onCapture={id => set('foto_drenaje_id', id)}
          onRemove={() => set('foto_drenaje_id', null)}
        />
      </div>

      {/* ── 3. Pendiente predominante ─────────────────────────────────────── */}
      <Field label="Pendiente predominante" hint="Selecciona y toca 'Ver referencia' para ver un ejemplo visual">
        <RadioGrp
          opts={['Plano', 'Lomerío', 'Montaña']}
          val={data.pendiente ?? ''}
          onChange={v => set('pendiente', v)}
          cols={3}
        />
      </Field>

      {/* Imagen de referencia pendiente (solo informativa — no requiere foto) */}
      {pendRef && (
        <div className="bg-[#0d7377]/5 rounded-xl p-3 border border-[#0d7377]/10">
          <p className="text-xs font-semibold text-[#0d7377] mb-2">Imagen de referencia — {data.pendiente}</p>
          <img
            src={pendRef.image}
            alt={pendRef.label}
            className="w-full max-h-40 object-cover rounded-lg"
          />
        </div>
      )}

      {/* ── 4. Roca superficial + Erosión ─────────────────────────────────── */}
      <Field label="Presencia de roca o cascajo superficial">
        <RadioGrp
          opts={['No', 'Escaso', 'Abundante']}
          val={data.presencia_roca ?? ''}
          onChange={v => set('presencia_roca', v)}
          cols={3}
        />
      </Field>

      <Field label="Erosión visible">
        <RadioGrp
          opts={['No', 'Leve', 'Moderada', 'Severa']}
          val={data.erosion ?? ''}
          onChange={v => set('erosion', v)}
          cols={4}
        />
      </Field>

      {/* FOTO erosión/roca — sin imagen de referencia */}
      <div className="bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Foto — Erosión / Roca superficial</p>
        <PhotoCapture
          fieldKey={`zona_${zona}_erosion`}
          localEvaluacionId={localEvaluacionId}
          currentPhotoId={data.foto_erosion_id ?? null}
          onCapture={id => set('foto_erosion_id', id)}
          onRemove={() => set('foto_erosion_id', null)}
        />
      </div>

      {/* ── 5. Fuente de agua ─────────────────────────────────────────────── */}
      <Field label="Fuente de agua cercana a la zona">
        <RadioGrp
          opts={['Quebrada', 'Río', 'Jagüey / estanque', 'Ninguna']}
          val={data.fuente_agua ?? ''}
          onChange={v => set('fuente_agua', v)}
          cols={2}
        />
      </Field>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Distancia aproximada (m)</label>
        <input
          type="number"
          min={0}
          placeholder="metros"
          value={data.distancia_agua_m ?? ''}
          onChange={e => set('distancia_agua_m', e.target.value ? parseFloat(e.target.value) : null)}
          className="w-40"
        />
      </div>

      {/* ── 6. Observaciones ─────────────────────────────────────────────── */}
      <Field label="Observaciones de suelo / topografía" hint="Zonas inundables, cárcavas, características especiales…">
        <textarea
          rows={3}
          value={data.observaciones_suelo ?? ''}
          onChange={e => set('observaciones_suelo', e.target.value)}
        />
      </Field>
    </div>
  )
}
