import { RadioGrp } from '../../components/ui/RadioGrp'
import type { SeccionCobertura } from '../../types/evaluacion'

interface Props {
  zona: number
  data: Partial<SeccionCobertura>
  onChange: (d: Partial<SeccionCobertura>) => void
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

const COBERTURA_BASE = ['Rastrojo bajo', 'Rastrojo alto', 'Pastizal', 'Bosque secundario', 'Bosque ripario', 'Mixto']

export function Step03({ zona, data, onChange }: Props) {
  const set = (k: keyof SeccionCobertura, v: unknown) => onChange({ ...data, [k]: v })

  // Detectar si la cobertura dominante es un valor "Otro"
  const coberturaEsBase = COBERTURA_BASE.includes(data.cobertura_dominante ?? '')
  const otroCobertura   = coberturaEsBase ? '' : (data.cobertura_dominante ?? '')

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-[#0d7377]">§3 Cobertura Vegetal — Zona {zona}</h2>

      {/* 1. Cobertura dominante */}
      <Field label="Cobertura dominante">
        <RadioGrp
          opts={COBERTURA_BASE}
          val={coberturaEsBase ? (data.cobertura_dominante ?? '') : ''}
          onChange={v => set('cobertura_dominante', v)}
          cols={2}
        />
        <input
          type="text"
          placeholder="Otro: especificar…"
          value={otroCobertura}
          onChange={e => set('cobertura_dominante', e.target.value)}
          className="mt-2"
        />
      </Field>

      {/* 2. % cobertura boscosa */}
      <Field label="% cobertura boscosa estimada">
        <RadioGrp
          opts={['< 10%', '10–30%', '30–60%', '60–80%', '> 80%']}
          val={data.pct_cobertura_boscosa ?? ''}
          onChange={v => set('pct_cobertura_boscosa', v)}
          cols={3}
        />
      </Field>

      {/* 3. Densidad del rastrojo */}
      <Field label="Densidad del rastrojo">
        <RadioGrp
          opts={['Denso', 'Moderado', 'Escaso']}
          val={data.densidad_rastrojo ?? ''}
          onChange={v => set('densidad_rastrojo', v)}
          cols={3}
        />
      </Field>

      {/* 4. Especies arbóreas */}
      <Field label="Especies arbóreas/arbustivas dominantes + alturas">
        <textarea
          rows={3}
          placeholder="Ej: Cecropia sp. ~8m, Heliconia sp. ~3m…"
          value={data.especies_arboreas_alturas ?? ''}
          onChange={e => set('especies_arboreas_alturas', e.target.value)}
        />
      </Field>

      {/* 5. Regeneración natural */}
      <Field label="Regeneración natural activa (plántulas/brinzales)">
        <RadioGrp
          opts={['Abundante', 'Moderada', 'Escasa']}
          val={data.regeneracion_natural ?? ''}
          onChange={v => set('regeneracion_natural', v)}
          cols={3}
        />
      </Field>

      {/* 6. Defaunación */}
      <Field label="Señales de defaunación (ausencia de dispersores)">
        <RadioGrp
          opts={['Sin indicios', 'Posible', 'Evidente']}
          val={data.defaunacion ?? ''}
          onChange={v => set('defaunacion', v)}
          cols={3}
        />
      </Field>
      <div className="space-y-1">
        <label className="block text-xs text-gray-500">Observaciones sobre defaunación</label>
        <textarea
          rows={2}
          placeholder="Describir indicios observados…"
          value={data.presion_fauna_ganado ?? ''}
          onChange={e => set('presion_fauna_ganado', e.target.value)}
        />
      </div>

      {/* 7. Requiere protección individual */}
      <Field label="¿Requiere protección individual de plántulas?">
        <RadioGrp
          opts={['Sí', 'No', 'Parcialmente']}
          val={data.requiere_proteccion ?? ''}
          onChange={v => set('requiere_proteccion', v)}
          cols={3}
        />
      </Field>
    </div>
  )
}
