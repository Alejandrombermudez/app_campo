import { RadioGrp } from '../../components/ui/RadioGrp'
import { ChkGroup } from '../../components/ui/ChkGroup'
import { YesNo } from '../../components/ui/YesNo'
import type { EncuestaGanaderia, OtraEspecie } from '../../types/encuesta'

interface Props { data: Partial<EncuestaGanaderia>; onChange: (d: Partial<EncuestaGanaderia>) => void }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="block text-sm font-medium text-gray-700">{label}</label>{hint && <p className="text-xs text-gray-400">{hint}</p>}{children}</div>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-4"><h3 className="text-xs font-bold uppercase tracking-widest text-[#0d7377] border-b border-[#0d7377]/20 pb-1">{title}</h3>{children}</div>
}
function Bool({ label, val, onChange }: { label: string; val: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={val} onChange={e => onChange(e.target.checked)} className="rounded accent-[#0d7377] w-4 h-4" />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )
}

type EspecieKey = 'equinos' | 'porcinos' | 'aves' | 'peces'
const ESPECIE_KEYS: EspecieKey[] = ['equinos','porcinos','aves','peces']
const ESPECIES = ['Equinos','Porcinos','Aves','Peces'] as const

export function EStep06({ data, onChange }: Props) {
  const s = (k: keyof EncuestaGanaderia, v: unknown) => onChange({ ...data, [k]: v })
  const setEspecie = (k: EspecieKey, field: keyof OtraEspecie, v: unknown) =>
    s(k, { ...(data[k] ?? {}), [field]: v })

  if (!data.tiene_ganaderia) {
    return (
      <div className="space-y-5">
        <h2 className="text-base font-semibold text-[#0d7377]">§6B Ganadería</h2>
        <Field label="¿Tiene ganado en el predio?">
          <YesNo val={data.tiene_ganaderia ?? null} onChange={v => s('tiene_ganaderia', v)} />
        </Field>

        {data.tiene_ganaderia === false && (
          <Section title="Otras especies pecuarias">
            {ESPECIE_KEYS.map((key, idx) => (
              <div key={key} className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2">
                <p className="text-sm font-medium text-gray-700">{ESPECIES[idx]}</p>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="text-xs text-gray-500">Cantidad</label>
                    <input type="text" value={(data[key] as Partial<OtraEspecie>)?.cantidad ?? ''} onChange={e => setEspecie(key, 'cantidad', e.target.value)} />
                  </div>
                  <label className="flex items-center gap-1 text-xs mt-4 cursor-pointer">
                    <input type="checkbox" checked={!!(data[key] as Partial<OtraEspecie>)?.uso_propio} onChange={e => setEspecie(key, 'uso_propio', e.target.checked)} />
                    Uso propio
                  </label>
                  <label className="flex items-center gap-1 text-xs mt-4 cursor-pointer">
                    <input type="checkbox" checked={!!(data[key] as Partial<OtraEspecie>)?.comercializacion} onChange={e => setEspecie(key, 'comercializacion', e.target.checked)} />
                    Venta
                  </label>
                </div>
              </div>
            ))}
          </Section>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-[#0d7377]">§6B Ganadería</h2>

      <Field label="¿Tiene ganado en el predio?">
        <YesNo val={data.tiene_ganaderia ?? null} onChange={v => s('tiene_ganaderia', v)} />
      </Field>

      <Section title="Inventario">
        <Field label="Tipo de tenencia">
          <RadioGrp opts={['Propio','Arriendo de tierras','Pastoreo de terceros']} val={data.tipo_tenencia_ganado ?? ''} onChange={v => s('tipo_tenencia_ganado', v)} cols={1} />
        </Field>
        <Field label="Orientación de la producción">
          <ChkGroup opts={['Producción de leche','Doble propósito (carne y leche)','Cría y levante','Ceba']} val={data.orientacion_ganaderia ?? []} onChange={v => s('orientacion_ganaderia', v)} cols={2} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nº de cabezas">
            <input type="number" min={0} value={data.num_cabezas_ganado ?? ''} onChange={e => s('num_cabezas_ganado', e.target.value ? +e.target.value : null)} />
          </Field>
          <Field label="Ha destinadas a ganadería">
            <input type="number" step="0.1" min={0} value={data.ha_ganaderia ?? ''} onChange={e => s('ha_ganaderia', e.target.value ? +e.target.value : null)} />
          </Field>
        </div>
        <Field label="Tipos de pasto">
          <ChkGroup opts={['Grama (criadero)','Mejorados','Corte','Silvopastoriles','Rastrojos']} val={data.tipos_pasto ?? []} onChange={v => s('tipos_pasto', v)} cols={2} />
        </Field>
      </Section>

      <Section title="Producción de leche">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Litros / día">
            <input type="number" step="0.1" min={0} value={data.litros_leche_dia ?? ''} onChange={e => s('litros_leche_dia', e.target.value ? +e.target.value : null)} />
          </Field>
          <Field label="Precio ($/litro)">
            <input type="number" min={0} value={data.precio_leche_litro ?? ''} onChange={e => s('precio_leche_litro', e.target.value ? +e.target.value : null)} />
          </Field>
        </div>
        <Field label="¿Tiene tanque de enfriamiento?">
          <RadioGrp opts={['Propio','Comunitario','Arrendado','No']} val={data.tanque_enfriamiento ?? ''} onChange={v => s('tanque_enfriamiento', v)} cols={4} />
        </Field>
        <Field label="Destino de la leche">
          <ChkGroup opts={['Autoconsumo','Venta local','Venta a intermediarios','Venta a industria procesadora','Otro']} val={data.destino_leche ?? []} onChange={v => s('destino_leche', v)} cols={2} />
        </Field>
      </Section>

      <Section title="Manejo del ganado">
        <Field label="Sistema de alimentación">
          <ChkGroup opts={['Pastoreo tradicional','Pastoreo rotacional','Pastoreo Voisin','Estabulado','Mixto']} val={data.sistema_alimentacion_ganado ?? []} onChange={v => s('sistema_alimentacion_ganado', v)} cols={2} />
        </Field>
        <Field label="Especies forrajeras utilizadas">
          <input type="text" value={data.especies_forrajeras ?? ''} onChange={e => s('especies_forrajeras', e.target.value)} />
        </Field>
        <Field label="Fertilización de praderas">
          <ChkGroup opts={['Química','Orgánica','Ninguna']} val={data.uso_fertilizacion_ganado ?? []} onChange={v => s('uso_fertilizacion_ganado', v)} cols={3} />
        </Field>
        <Field label="Manejo de praderas">
          <ChkGroup opts={['Resiembra','Rotación de potreros','Control de malezas']} val={data.manejo_praderas ?? []} onChange={v => s('manejo_praderas', v)} cols={2} />
        </Field>
        <Field label="Infraestructura en la finca">
          <ChkGroup opts={['Sala de ordeño','Corrales','Bebederos y comederos','Tanque de agua','Caminos de acceso adecuados']} val={data.infraestructura_ganadera ?? []} onChange={v => s('infraestructura_ganadera', v)} cols={2} />
        </Field>
        <Field label="Material de postes">
          <ChkGroup opts={['Postes muertos','Madera','Concreto','Plástico','Otro']} val={data.material_postes ?? []} onChange={v => s('material_postes', v)} cols={3} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ha de pasto sembradas último año">
            <input type="number" step="0.1" min={0} value={data.ha_pasto_ultimo_anio ?? ''} onChange={e => s('ha_pasto_ultimo_anio', e.target.value ? +e.target.value : null)} />
          </Field>
        </div>
        <Field label="Origen de los nuevos pastos">
          <ChkGroup opts={['Bosque','Gramas (nativas)']} val={data.origen_nuevos_pastos ?? []} onChange={v => s('origen_nuevos_pastos', v)} cols={2} />
        </Field>
      </Section>

      <Section title="Prácticas de ganadería regenerativa">
        <div className="space-y-2">
          {([
            ['pastoreo_rotacional',           'Pastoreo rotacional con tiempos de descanso adecuados'],
            ['diversificacion_forrajera',      'Diversificación de especies forrajeras'],
            ['cercas_vivas',                   'Cercas vivas o barreras naturales'],
            ['sistemas_silvopastoriles',       'Sistemas silvopastoriles (árboles en pasturas)'],
            ['captacion_agua_lluvia',          'Captación y almacenamiento de agua lluvia'],
            ['manejo_residuos_organicos',      'Manejo de residuos orgánicos para fertilización'],
            ['reduccion_antibioticos',         'Reducción del uso de antibióticos y químicos'],
            ['espacios_sombra_agua',           'Espacios de sombra y acceso a agua limpia'],
            ['reduccion_estres',               'Reducción del estrés por confinamiento'],
            ['interes_ganaderia_regenerativa', '¿Interés en recibir asesoría sobre ganadería regenerativa?'],
          ] as [keyof EncuestaGanaderia, string][]).map(([key, label]) => (
            <Bool key={key} label={label} val={!!(data[key] as boolean)} onChange={v => s(key, v)} />
          ))}
        </div>
      </Section>

      <Section title="Otras especies pecuarias">
        {ESPECIE_KEYS.map((key, idx) => (
          <div key={key} className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2">
            <p className="text-sm font-medium text-gray-700">{ESPECIES[idx]}</p>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="text-xs text-gray-500">Cantidad</label>
                <input type="text" value={(data[key] as Partial<OtraEspecie>)?.cantidad ?? ''} onChange={e => setEspecie(key, 'cantidad', e.target.value)} />
              </div>
              <label className="flex items-center gap-1 text-xs mt-4 cursor-pointer">
                <input type="checkbox" checked={!!(data[key] as Partial<OtraEspecie>)?.uso_propio} onChange={e => setEspecie(key, 'uso_propio', e.target.checked)} />
                Uso propio
              </label>
              <label className="flex items-center gap-1 text-xs mt-4 cursor-pointer">
                <input type="checkbox" checked={!!(data[key] as Partial<OtraEspecie>)?.comercializacion} onChange={e => setEspecie(key, 'comercializacion', e.target.checked)} />
                Venta
              </label>
            </div>
          </div>
        ))}
      </Section>
    </div>
  )
}
