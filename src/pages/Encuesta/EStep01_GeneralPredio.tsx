import { ChkGroup } from '../../components/ui/ChkGroup'
import { RadioGrp } from '../../components/ui/RadioGrp'
import { YesNo } from '../../components/ui/YesNo'
import type { EncuestaGeneral } from '../../types/encuesta'

interface Props { data: Partial<EncuestaGeneral>; onChange: (d: Partial<EncuestaGeneral>) => void }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      {children}
    </div>
  )
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-[#0d7377] border-b border-[#0d7377]/20 pb-1">{title}</h3>
      {children}
    </div>
  )
}

export function EStep01({ data, onChange }: Props) {
  const s = (k: keyof EncuestaGeneral, v: unknown) => onChange({ ...data, [k]: v })
  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-[#0d7377]">§1 Datos Generales</h2>

      <Section title="Identificación de la encuesta">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Encuesta No.">
            <input type="text" placeholder="001" value={data.encuesta_no ?? ''} onChange={e => s('encuesta_no', e.target.value)} />
          </Field>
          <Field label="Fecha">
            <input type="date" value={data.fecha_encuesta ?? ''} onChange={e => s('fecha_encuesta', e.target.value)} />
          </Field>
        </div>
        <Field label="Encuestador">
          <input type="text" value={data.encuestador ?? ''} onChange={e => s('encuestador', e.target.value)} />
        </Field>
        <Field label="Tipo de encuestado">
          <RadioGrp opts={['Propietario','Arrendatario','Mayordomo','Trabajador']} val={data.tipo_encuestado ?? ''} onChange={v => s('tipo_encuestado', v)} cols={2} />
        </Field>
        <Field label="Nombre del respondiente">
          <input type="text" value={data.nombre_propietario ?? ''} onChange={e => s('nombre_propietario', e.target.value)} />
        </Field>
        <Field label="Contacto">
          <input type="tel" placeholder="Teléfono / WhatsApp" value={data.contacto ?? ''} onChange={e => s('contacto', e.target.value)} />
        </Field>
      </Section>

      <h2 className="text-base font-semibold text-[#0d7377]">§2 Datos del Predio</h2>

      <Section title="Ubicación">
        <Field label="Nombre de la finca">
          <input type="text" value={data.nombre_finca ?? ''} onChange={e => s('nombre_finca', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Departamento">
            <input type="text" value="Caquetá" readOnly className="bg-gray-50 text-gray-400" />
          </Field>
          <Field label="Municipio">
            <input type="text" value={data.municipio ?? ''} onChange={e => s('municipio', e.target.value)} />
          </Field>
        </div>
        <Field label="Vereda">
          <input type="text" value={data.vereda ?? ''} onChange={e => s('vereda', e.target.value)} />
        </Field>
      </Section>

      <Section title="Estrato del paisaje">
        <RadioGrp
          opts={['Sabana','Vega','Tierra firme intervención alta','Tierra firme intervención media','Tierra firme intervención baja']}
          val={data.estrato_paisaje ?? ''} onChange={v => s('estrato_paisaje', v)} cols={1}
        />
      </Section>

      <Section title="Coordenadas y altitud">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitud N">
            <input type="text" placeholder="ej: 1.234567" value={data.latitud ?? ''} onChange={e => s('latitud', e.target.value)} />
          </Field>
          <Field label="Longitud W">
            <input type="text" placeholder="ej: -75.234567" value={data.longitud ?? ''} onChange={e => s('longitud', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Altitud (msnm)">
            <input type="number" value={data.altitud_msnm ?? ''} onChange={e => s('altitud_msnm', e.target.value ? +e.target.value : null)} />
          </Field>
          <Field label="Año adquisición">
            <input type="number" placeholder="2010" value={data.anio_adquisicion ?? ''} onChange={e => s('anio_adquisicion', e.target.value ? +e.target.value : null)} />
          </Field>
        </div>
        <Field label="Distancia a cabecera municipal (km)">
          <input type="number" step="0.1" value={data.distancia_cabecera_km ?? ''} onChange={e => s('distancia_cabecera_km', e.target.value ? +e.target.value : null)} />
        </Field>
      </Section>

      <Section title="Acceso">
        <Field label="Tipo de vía">
          <ChkGroup opts={['Vía pavimentada','Vía sin pavimentar','Río','Camino de herradura']} val={data.tipo_via ?? []} onChange={v => s('tipo_via', v)} cols={2} />
        </Field>
        <Field label="Tipo de acceso al predio">
          <ChkGroup opts={['Carro','Moto','Caballo','Pie','Canoa']} val={data.tipo_acceso_predio ?? []} onChange={v => s('tipo_acceso_predio', v)} cols={3} />
        </Field>
      </Section>

      <Section title="Servicios">
        <Field label="Servicios domiciliarios">
          <ChkGroup opts={['Energía eléctrica','Planta solar','Planta gasolina','No tiene']} val={data.servicios_domiciliarios ?? []} onChange={v => s('servicios_domiciliarios', v)} cols={2} />
        </Field>
        <Field label="Fuente de agua">
          <ChkGroup opts={['Acueducto veredal','Reservorios','Cuerpos de agua','Perforado / pozo','No tiene']} val={data.fuente_agua ?? []} onChange={v => s('fuente_agua', v)} cols={2} />
        </Field>
        <Field label="¿Hay señal telefónica?">
          <YesNo val={data.senal_telefonica ?? null} onChange={v => s('senal_telefonica', v)} />
        </Field>
      </Section>
    </div>
  )
}
