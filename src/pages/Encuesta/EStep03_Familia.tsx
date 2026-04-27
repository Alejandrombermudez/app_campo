import { RadioGrp } from '../../components/ui/RadioGrp'
import { YesNo } from '../../components/ui/YesNo'
import { Plus, Trash2 } from 'lucide-react'
import type { EncuestaFamilia, MiembroFamilia } from '../../types/encuesta'

interface Props { data: Partial<EncuestaFamilia>; onChange: (d: Partial<EncuestaFamilia>) => void }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="block text-sm font-medium text-gray-700">{label}</label>{children}</div>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-4"><h3 className="text-xs font-bold uppercase tracking-widest text-[#0d7377] border-b border-[#0d7377]/20 pb-1">{title}</h3>{children}</div>
}

const emptyMiembro = (): MiembroFamilia => ({
  parentesco: '', edad: '', sexo: '', depto_procedencia: '',
  depto_residencia: '', nivel_estudio: '', dias_finca: '', dias_fuera: '',
})

export function EStep03({ data, onChange }: Props) {
  const s = (k: keyof EncuestaFamilia, v: unknown) => onChange({ ...data, [k]: v })
  const miembros = data.miembros ?? []

  function setMiembro(i: number, k: keyof MiembroFamilia, v: string) {
    const next = miembros.map((m, idx) => idx === i ? { ...m, [k]: v } : m)
    s('miembros', next)
  }
  function addMiembro() { s('miembros', [...miembros, emptyMiembro()]) }
  function removeMiembro(i: number) { s('miembros', miembros.filter((_, idx) => idx !== i)) }

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-[#0d7377]">§4 Información del Núcleo Familiar</h2>

      <Section title="Población">
        <Field label="En los últimos 10 años, el número de personas en la finca se ha:">
          <RadioGrp opts={['Incrementado','Disminuido']} val={data.poblacion_tendencia ?? ''} onChange={v => s('poblacion_tendencia', v)} cols={2} />
        </Field>
      </Section>

      <Section title="Salud">
        <Field label="¿Tiene acceso a servicios de salud?">
          <YesNo val={data.acceso_salud ?? null} onChange={v => s('acceso_salud', v)} />
        </Field>
        {data.acceso_salud && (
          <Field label="Régimen de salud">
            <RadioGrp opts={['Contributivo','Subsidiado']} val={data.regimen_salud ?? ''} onChange={v => s('regimen_salud', v)} cols={2} />
          </Field>
        )}
        <Field label="Puesto de salud más cercano y distancia">
          <input type="text" placeholder="Ej: Centro de salud El Paujil, 5 km" value={data.puesto_salud ?? ''} onChange={e => s('puesto_salud', e.target.value)} />
        </Field>
      </Section>

      <Section title="Educación">
        <Field label="¿Tiene acceso a servicios de educación?">
          <YesNo val={data.acceso_educacion ?? null} onChange={v => s('acceso_educacion', v)} />
        </Field>
        {data.acceso_educacion && (
          <Field label="Distancia al centro educativo (km)">
            <input type="number" step="0.1" min={0} value={data.distancia_educacion_km ?? ''} onChange={e => s('distancia_educacion_km', e.target.value ? +e.target.value : null)} />
          </Field>
        )}
      </Section>

      <Section title="Historia familiar">
        <Field label="¿Cuánto tiempo lleva la familia en la región?">
          <input type="text" placeholder="Ej: 15 años" value={data.tiempo_llegada_region ?? ''} onChange={e => s('tiempo_llegada_region', e.target.value)} />
        </Field>
        <Field label="¿Cuál fue la razón de llegada?">
          <textarea rows={2} value={data.razon_llegada ?? ''} onChange={e => s('razon_llegada', e.target.value)} />
        </Field>
      </Section>

      <Section title="Miembros del núcleo familiar">
        <p className="text-xs text-gray-500">Registra cada persona que vive en la finca.</p>

        {miembros.length > 0 && (
          <div className="space-y-3">
            {miembros.map((m, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">Miembro {i + 1}</span>
                  <button onClick={() => removeMiembro(i)} className="text-red-400"><Trash2 size={14} /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['parentesco','Parentesco','Hijo/a, Cónyuge…'],
                    ['edad','Edad','años'],
                    ['sexo','Sexo','M / F'],
                    ['nivel_estudio','Nivel de estudio','Primaria…'],
                    ['depto_procedencia','Depto. de procedencia',''],
                    ['depto_residencia','Depto. de residencia actual',''],
                    ['dias_finca','Días/mes en finca',''],
                    ['dias_fuera','Días/mes fuera de finca',''],
                  ] as [keyof MiembroFamilia, string, string][]).map(([key, label, ph]) => (
                    <div key={key} className="space-y-0.5">
                      <label className="text-xs text-gray-500">{label}</label>
                      <input type="text" placeholder={ph} value={m[key]} onChange={e => setMiembro(i, key, e.target.value)} className="text-sm" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addMiembro}
          className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#0d7377]/30 rounded-xl py-3 text-sm text-[#0d7377]"
        >
          <Plus size={16} /> Agregar miembro
        </button>
      </Section>
    </div>
  )
}
