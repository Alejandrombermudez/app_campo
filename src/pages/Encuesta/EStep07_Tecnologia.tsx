import { RadioGrp } from '../../components/ui/RadioGrp'
import { ChkGroup } from '../../components/ui/ChkGroup'
import { YesNo } from '../../components/ui/YesNo'
import type { EncuestaTecnologia } from '../../types/encuesta'

interface Props { data: Partial<EncuestaTecnologia>; onChange: (d: Partial<EncuestaTecnologia>) => void }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="block text-sm font-medium text-gray-700">{label}</label>{hint && <p className="text-xs text-gray-400">{hint}</p>}{children}</div>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-4"><h3 className="text-xs font-bold uppercase tracking-widest text-[#0d7377] border-b border-[#0d7377]/20 pb-1">{title}</h3>{children}</div>
}

export function EStep07({ data, onChange }: Props) {
  const s = (k: keyof EncuestaTecnologia, v: unknown) => onChange({ ...data, [k]: v })
  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-[#0d7377]">§7 Nivel Tecnológico</h2>

      <Section title="Maquinaria y equipo">
        <Field label="¿Qué maquinaria, instalaciones y equipos tiene?">
          <textarea rows={2} value={data.instalaciones_maquinaria ?? ''} onChange={e => s('instalaciones_maquinaria', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="¿Tiene tractor?">
            <YesNo val={data.tiene_tractor ?? null} onChange={v => s('tiene_tractor', v)} />
          </Field>
          <Field label="¿Tiene camión?">
            <YesNo val={data.tiene_camion ?? null} onChange={v => s('tiene_camion', v)} />
          </Field>
        </div>
      </Section>

      <Section title="Manejo de suelos y cultivos">
        <Field label="Manejo del suelo y fertilización">
          <RadioGrp opts={['Orgánico','Convencional','Mixto']} val={data.manejo_suelo_fertilizacion ?? ''} onChange={v => s('manejo_suelo_fertilizacion', v)} cols={3} />
        </Field>
        <Field label="Tipo de fertilización utilizada">
          <ChkGroup opts={['Química','Orgánica','Ninguna']} val={data.tipo_fertilizacion ?? []} onChange={v => s('tipo_fertilizacion', v)} cols={3} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="¿Tiene cobertura arbórea asociada?">
            <YesNo val={data.cobertura_arborea ?? null} onChange={v => s('cobertura_arborea', v)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="¿Practica podas?">
            <YesNo val={data.practica_podas ?? null} onChange={v => s('practica_podas', v)} />
          </Field>
          <Field label="¿Practica raleo?">
            <YesNo val={data.practica_raleo ?? null} onChange={v => s('practica_raleo', v)} />
          </Field>
        </div>
        <Field label="Control de malezas">
          <ChkGroup opts={['Manual','Químico','Mecánico']} val={data.control_malezas ?? []} onChange={v => s('control_malezas', v)} cols={3} />
        </Field>
        <Field label="Manejo del agua para cultivos">
          <RadioGrp opts={['Riego','Secano','Otro']} val={data.manejo_agua_cultivo ?? ''} onChange={v => s('manejo_agua_cultivo', v)} cols={3} />
        </Field>
      </Section>

      <Section title="Condiciones del sistema productivo">
        <Field label="Principales problemas de manejo">
          <ChkGroup opts={['Plagas','Enfermedades','Clima','Comercialización','Otro']} val={data.problemas_manejo ?? []} onChange={v => s('problemas_manejo', v)} cols={2} />
        </Field>
        <Field label="Especies o variedades cultivadas">
          <input type="text" value={data.especies_variedades ?? ''} onChange={e => s('especies_variedades', e.target.value)} />
        </Field>
        <Field label="¿Lleva registros de productividad?">
          <YesNo val={data.lleva_registros_productividad ?? null} onChange={v => s('lleva_registros_productividad', v)} />
        </Field>
      </Section>

      <Section title="Capacitación">
        <Field label="¿Tiene interés en recibir capacitación o asistencia técnica?">
          <YesNo val={data.interes_capacitacion ?? null} onChange={v => s('interes_capacitacion', v)} />
        </Field>
        {data.interes_capacitacion && (
          <Field label="¿En qué temas le gustaría recibir apoyo?">
            <textarea rows={3} value={data.temas_capacitacion ?? ''} onChange={e => s('temas_capacitacion', e.target.value)} />
          </Field>
        )}
      </Section>
    </div>
  )
}
