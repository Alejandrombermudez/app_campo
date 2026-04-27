import { ChkGroup } from '../../components/ui/ChkGroup'
import { RadioGrp } from '../../components/ui/RadioGrp'
import { YesNo } from '../../components/ui/YesNo'
import type { EncuestaBosque } from '../../types/encuesta'

interface Props { data: Partial<EncuestaBosque>; onChange: (d: Partial<EncuestaBosque>) => void }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="block text-sm font-medium text-gray-700">{label}</label>{hint && <p className="text-xs text-gray-400">{hint}</p>}{children}</div>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-4"><h3 className="text-xs font-bold uppercase tracking-widest text-[#0d7377] border-b border-[#0d7377]/20 pb-1">{title}</h3>{children}</div>
}

export function EStep08({ data, onChange }: Props) {
  const s = (k: keyof EncuestaBosque, v: unknown) => onChange({ ...data, [k]: v })
  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-[#0d7377]">§8 Usos del Bosque y Cambio Climático</h2>

      <Section title="Uso del bosque">
        <Field label="¿Aprovecha productos del bosque?">
          <YesNo val={data.aprovecha_bosque ?? null} onChange={v => s('aprovecha_bosque', v)} />
        </Field>
        {data.aprovecha_bosque && (
          <Field label="¿Qué tipo de productos forestales utiliza?">
            <textarea rows={2} value={data.productos_forestales ?? ''} onChange={e => s('productos_forestales', e.target.value)} />
          </Field>
        )}
        <Field label="¿Ha recibido capacitación sobre el medio ambiente?">
          <YesNo val={data.capacitacion_ambiente ?? null} onChange={v => s('capacitacion_ambiente', v)} />
        </Field>
        {data.capacitacion_ambiente && (
          <Field label="¿De qué entidad?">
            <input type="text" value={data.entidad_capacitacion ?? ''} onChange={e => s('entidad_capacitacion', e.target.value)} />
          </Field>
        )}
      </Section>

      <Section title="Biodiversidad">
        <Field label="Especies forestales que reconoce en su predio">
          <textarea rows={2} placeholder="Ej: cedro, laurel, palo de arco…" value={data.especies_bosque_predio ?? ''} onChange={e => s('especies_bosque_predio', e.target.value)} />
        </Field>
        <Field label="Especies de fauna que reconoce en su predio">
          <textarea rows={2} placeholder="Ej: danta, armadillo, lapa…" value={data.especies_fauna_predio ?? ''} onChange={e => s('especies_fauna_predio', e.target.value)} />
        </Field>
        <Field label="¿Se ha realizado algún estudio académico / científico en el predio?">
          <YesNo val={data.estudio_academico ?? null} onChange={v => s('estudio_academico', v)} />
        </Field>
        <Field label="¿Ha observado disminución de especies de fauna y flora desde que llegó?">
          <YesNo val={data.disminucion_especies ?? null} onChange={v => s('disminucion_especies', v)} />
        </Field>
        {data.disminucion_especies && (
          <Field label="¿Cuáles especies están más afectadas?">
            <textarea rows={2} value={data.especies_afectadas ?? ''} onChange={e => s('especies_afectadas', e.target.value)} />
          </Field>
        )}
        <Field label="¿Ha observado cambios en el caudal de fuentes de agua?">
          <YesNo val={data.cambios_caudal ?? null} onChange={v => s('cambios_caudal', v)} />
        </Field>
      </Section>

      <Section title="Cambio de cobertura">
        <Field label="Cambio en cobertura vegetal desde que llegó (ha)">
          <input type="number" step="0.1" value={data.cambio_cobertura_ha ?? ''} onChange={e => s('cambio_cobertura_ha', e.target.value ? +e.target.value : null)} />
        </Field>
        <Field label="¿A qué se debe este cambio?">
          <ChkGroup opts={['Establecimiento de pasturas','Establecimiento de cultivos','Otros']} val={data.causa_cambio_cobertura ?? []} onChange={v => s('causa_cambio_cobertura', v)} cols={2} />
        </Field>
        <Field label="Problemas que afectan su producción agropecuaria">
          <ChkGroup
            opts={['Calidad de suelos','Inundación / exceso de lluvia','Sequía','Incendios','Plagas','Cambio climático','Carencia de vías','Falta de incentivos','Problemas de seguridad','Otros']}
            val={data.problemas_agropecuarios ?? []} onChange={v => s('problemas_agropecuarios', v)} cols={2}
          />
        </Field>
      </Section>

      <h2 className="text-base font-semibold text-[#0d7377]">§9 Relaciones Internas y Externas</h2>

      <Section title="Programas e instituciones">
        <Field label="¿Reconoce algún programa gubernamental o apoyo institucional en la región?">
          <textarea rows={2} placeholder="Nombre del programa / entidad…" value={data.programas_gubernamentales ?? ''} onChange={e => s('programas_gubernamentales', e.target.value)} />
        </Field>
        <Field label="¿Ha participado en algún programa? ¿Qué beneficio recibió?">
          <textarea rows={2} placeholder="Capacitación, apoyo económico, asistencia técnica…" value={data.beneficios_programas ?? ''} onChange={e => s('beneficios_programas', e.target.value)} />
        </Field>
        <Field label="El impacto del programa fue:">
          <RadioGrp opts={['Positivo','Negativo','No causó ningún cambio']} val={data.impacto_programa ?? ''} onChange={v => s('impacto_programa', v)} cols={2} />
        </Field>
        <Field label="¿La opinión de los productores es tenida en cuenta en la toma de decisiones?">
          <YesNo val={data.opinion_productores ?? null} onChange={v => s('opinion_productores', v)} />
        </Field>
      </Section>

      <Section title="Cooperativas y gremios">
        <Field label="¿Está aliado a alguna cooperativa o asociación gremial?">
          <YesNo val={data.aliado_cooperativa ?? null} onChange={v => s('aliado_cooperativa', v)} />
        </Field>
        {data.aliado_cooperativa && (
          <>
            <Field label="¿Cuál(es)?">
              <input type="text" value={data.nombre_cooperativa ?? ''} onChange={e => s('nombre_cooperativa', e.target.value)} />
            </Field>
            <Field label="¿Cómo se beneficia de esta alianza?">
              <textarea rows={2} value={data.beneficio_cooperativa ?? ''} onChange={e => s('beneficio_cooperativa', e.target.value)} />
            </Field>
          </>
        )}
        <Field label="¿Cómo califica el compromiso de las asociaciones gremiales?">
          <RadioGrp opts={['Suficiente','Insuficiente','No existe']} val={data.calificacion_gremios ?? ''} onChange={v => s('calificacion_gremios', v)} cols={3} />
        </Field>
      </Section>

      <Section title="Observaciones generales">
        <textarea rows={4} placeholder="Cualquier información adicional relevante…" value={data.observaciones_generales ?? ''} onChange={e => s('observaciones_generales', e.target.value)} />
      </Section>
    </div>
  )
}
