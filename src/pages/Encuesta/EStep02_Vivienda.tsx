import { RadioGrp } from '../../components/ui/RadioGrp'
import { ChkGroup } from '../../components/ui/ChkGroup'
import type { EncuestaVivienda } from '../../types/encuesta'

interface Props { data: Partial<EncuestaVivienda>; onChange: (d: Partial<EncuestaVivienda>) => void }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="block text-sm font-medium text-gray-700">{label}</label>{children}</div>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-4"><h3 className="text-xs font-bold uppercase tracking-widest text-[#0d7377] border-b border-[#0d7377]/20 pb-1">{title}</h3>{children}</div>
}

export function EStep02({ data, onChange }: Props) {
  const s = (k: keyof EncuestaVivienda, v: unknown) => onChange({ ...data, [k]: v })
  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-[#0d7377]">§3 Característica de la Vivienda</h2>

      <Section title="Materiales de construcción">
        <Field label="Techo">
          <RadioGrp opts={['Zinc','Madera','Paja','Eternit','Otro']} val={data.material_techo ?? ''} onChange={v => s('material_techo', v)} cols={3} />
        </Field>
        <Field label="Paredes">
          <RadioGrp opts={['Bahareque','Guadua','Madera','Ladrillo / Bloque','Otro']} val={data.material_paredes ?? ''} onChange={v => s('material_paredes', v)} cols={2} />
        </Field>
        <Field label="Piso">
          <RadioGrp opts={['Tierra','Cemento','Baldosa','Madera','Otro']} val={data.material_piso ?? ''} onChange={v => s('material_piso', v)} cols={3} />
        </Field>
      </Section>

      <Section title="Habitabilidad">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nº de habitaciones">
            <input type="number" min={0} value={data.num_habitaciones ?? ''} onChange={e => s('num_habitaciones', e.target.value ? +e.target.value : null)} />
          </Field>
          <Field label="Personas en la vivienda">
            <input type="number" min={0} value={data.personas_vivienda ?? ''} onChange={e => s('personas_vivienda', e.target.value ? +e.target.value : null)} />
          </Field>
        </div>
      </Section>

      <Section title="Servicios básicos">
        <Field label="La cocina tiene">
          <ChkGroup opts={['Fogón de leña','Estufa de carbón','Estufa a gasolina','Estufa de gas','Otro']} val={data.tipo_cocina ?? []} onChange={v => s('tipo_cocina', v)} cols={2} />
        </Field>
        <Field label="El baño tiene">
          <ChkGroup opts={['Unidad sanitaria','Baño con taza','Ducha','Tanque de agua','Otro']} val={data.tipo_bano ?? []} onChange={v => s('tipo_bano', v)} cols={2} />
        </Field>
      </Section>

      <Section title="Saneamiento">
        <Field label="Sitio donde vierten las excretas">
          <RadioGrp opts={['Pozo séptico','Caño o río','Campo abierto','Alcantarillado']} val={data.disposicion_excretas ?? ''} onChange={v => s('disposicion_excretas', v)} cols={2} />
        </Field>
        <Field label="Sitio donde vierten las aguas servidas">
          <RadioGrp opts={['Pozo séptico','Caño o río','Campo abierto','Alcantarillado']} val={data.disposicion_aguas_servidas ?? ''} onChange={v => s('disposicion_aguas_servidas', v)} cols={2} />
        </Field>
        <Field label="Manejo de basuras y disposición final">
          <ChkGroup opts={['Quema','Hueco','Campo abierto','Clasifica para compost / reciclaje','Servicio de recolección']} val={data.manejo_basuras ?? []} onChange={v => s('manejo_basuras', v)} cols={2} />
        </Field>
      </Section>
    </div>
  )
}
