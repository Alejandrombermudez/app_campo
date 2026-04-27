import { RadioGrp } from '../../components/ui/RadioGrp'
import { ChkGroup } from '../../components/ui/ChkGroup'
import { YesNo } from '../../components/ui/YesNo'
import type { EncuestaEconomia } from '../../types/encuesta'

interface Props { data: Partial<EncuestaEconomia>; onChange: (d: Partial<EncuestaEconomia>) => void }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="block text-sm font-medium text-gray-700">{label}</label>{hint && <p className="text-xs text-gray-400">{hint}</p>}{children}</div>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-4"><h3 className="text-xs font-bold uppercase tracking-widest text-[#0d7377] border-b border-[#0d7377]/20 pb-1">{title}</h3>{children}</div>
}

export function EStep04({ data, onChange }: Props) {
  const s = (k: keyof EncuestaEconomia, v: unknown) => onChange({ ...data, [k]: v })
  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-[#0d7377]">§5 Valorización de la Unidad Productiva</h2>

      <Section title="Tamaño y valor del predio">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hectáreas totales">
            <input type="number" step="0.1" min={0} value={data.ha_total ?? ''} onChange={e => s('ha_total', e.target.value ? +e.target.value : null)} />
          </Field>
          <Field label="Valor comercial ($/ha)">
            <input type="number" min={0} value={data.valor_comercial_ha ?? ''} onChange={e => s('valor_comercial_ha', e.target.value ? +e.target.value : null)} />
          </Field>
        </div>
      </Section>

      <Section title="Cambios en el área">
        <Field label="En el último año, el área de la finca se ha:">
          <RadioGrp opts={['Incrementado','Disminuido']} val={data.tendencia_area ?? ''} onChange={v => s('tendencia_area', v)} cols={2} />
        </Field>
        {data.tendencia_area && (
          <Field label="¿Cuántas hectáreas?">
            <input type="number" step="0.1" min={0} value={data.cambio_area_ha ?? ''} onChange={e => s('cambio_area_ha', e.target.value ? +e.target.value : null)} />
          </Field>
        )}
      </Section>

      <Section title="Intención de venta">
        <Field label="¿Ha considerado vender la finca?">
          <YesNo val={data.intencion_vender ?? null} onChange={v => s('intencion_vender', v)} />
        </Field>
        {data.intencion_vender && (
          <Field label="Causas">
            <ChkGroup opts={['Orden público','Baja rentabilidad','Oferta de compra','Compra de otra finca']} val={data.causas_venta ?? []} onChange={v => s('causas_venta', v)} cols={2} />
          </Field>
        )}
      </Section>

      <Section title="Transporte y mercado">
        <Field label="Medio de transporte de la producción al municipio">
          <input type="text" placeholder="Ej: camión, moto, canoa…" value={data.medio_transporte_produccion ?? ''} onChange={e => s('medio_transporte_produccion', e.target.value)} />
        </Field>
        <Field label="¿El transporte es propio o rentado?">
          <RadioGrp opts={['Propio','Rentado']} val={data.transporte_propio ?? ''} onChange={v => s('transporte_propio', v)} cols={2} />
        </Field>
        <Field label="Costo del transporte (finca → municipio) $">
          <input type="number" min={0} value={data.valor_transporte ?? ''} onChange={e => s('valor_transporte', e.target.value ? +e.target.value : null)} />
        </Field>
        <Field label="¿Tiene problemas de acceso al mercado?">
          <textarea rows={2} placeholder="Describa brevemente…" value={data.problemas_mercado ?? ''} onChange={e => s('problemas_mercado', e.target.value)} />
        </Field>
      </Section>

      <Section title="Ingresos mensuales">
        <RadioGrp
          opts={['< 1 SMLV','> 1 SMLV','< 5 SMLV','> 5 SMLV']}
          val={data.nivel_ingresos ?? ''} onChange={v => s('nivel_ingresos', v)} cols={2}
        />
      </Section>
    </div>
  )
}
