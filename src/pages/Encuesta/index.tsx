import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Save, CheckCircle } from 'lucide-react'
import { db } from '../../db/schema'
import type { EncuestaPredialRecord, CultivoRow } from '../../types/encuesta'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { EStep01 } from './EStep01_GeneralPredio'
import { EStep02 } from './EStep02_Vivienda'
import { EStep03 } from './EStep03_Familia'
import { EStep04 } from './EStep04_Economia'
import { EStep05 } from './EStep05_Cultivos'
import { EStep06 } from './EStep06_Ganaderia'
import { EStep07 } from './EStep07_Tecnologia'
import { EStep08 } from './EStep08_BosqueRelaciones'

const STEPS = [
  { id: 'general',     label: '§1-2 General y Predio' },
  { id: 'vivienda',    label: '§3 Vivienda' },
  { id: 'familia',     label: '§4 Familia' },
  { id: 'economia',    label: '§5 Economía' },
  { id: 'cultivos',    label: '§6A Cultivos' },
  { id: 'ganaderia',   label: '§6B Ganadería' },
  { id: 'tecnologia',  label: '§7 Tecnología' },
  { id: 'bosque',      label: '§8-9 Bosque y Relaciones' },
]

const CULTIVOS_BASE = ['Café','Cacao','Caña de azúcar','Plátano','Yuca','Frutales','Madera']
const emptyCultivo  = (nombre = ''): CultivoRow => ({ cultivo: nombre, area_ha: '', anio_siembra: '', densidad: '', rendimiento: '', destino: '' })

function newEncuesta(): EncuestaPredialRecord {
  return {
    local_id:           crypto.randomUUID(),
    supabase_id:        null,
    sync_status:        'pending',
    sync_error:         null,
    created_at:         new Date().toISOString(),
    updated_at:         new Date().toISOString(),
    step_completed:     0,
    created_by:         localStorage.getItem('ae_campo_user') ?? '',
    nombre_propietario: '',
    municipio:          '',
    vereda:             '',
    fecha_encuesta:     '',
    sec_general:        { departamento: 'Caquetá' },
    sec_vivienda:       {},
    sec_familia:        {},
    sec_economia:       {},
    sec_cultivos:       CULTIVOS_BASE.map(emptyCultivo),
    sec_ganaderia:      {},
    sec_tecnologia:     {},
    sec_bosque:         {},
  }
}

export function EncuestaPage() {
  const { id }  = useParams<{ id?: string }>()
  const navigate = useNavigate()

  const [ev, setEv]           = useState<EncuestaPredialRecord>(newEncuesta())
  const [stepIdx, setStepIdx] = useState(0)
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false)
  const [loaded, setLoaded]   = useState(false)

  useEffect(() => {
    if (!id) { setLoaded(true); return }
    db.encuestas.where('local_id').equals(id).first().then(found => {
      if (found) { setEv(found); setStepIdx(found.step_completed ?? 0) }
      setLoaded(true)
    })
  }, [id])

  const total = STEPS.length
  const step  = STEPS[stepIdx]

  // Sincronizar resumen con sec_general
  function handleGeneralChange(g: typeof ev.sec_general) {
    setEv(p => ({
      ...p,
      sec_general:        { ...p.sec_general, ...g },
      nombre_propietario: g.nombre_propietario ?? p.nombre_propietario,
      municipio:          g.municipio          ?? p.municipio,
      vereda:             g.vereda             ?? p.vereda,
      fecha_encuesta:     g.fecha_encuesta     ?? p.fecha_encuesta,
    }))
  }

  async function saveAndNext() {
    setSaving(true)
    const updated: EncuestaPredialRecord = {
      ...ev,
      step_completed: Math.max(ev.step_completed, stepIdx),
      updated_at:     new Date().toISOString(),
    }
    try {
      if (updated.id) {
        await db.encuestas.put(updated)
      } else {
        const newId = await db.encuestas.add(updated)
        updated.id = newId
        setEv(updated)
      }
      if (stepIdx < total - 1) {
        setStepIdx(i => i + 1)
      } else {
        await db.encuestas.update(updated.id!, { step_completed: total - 1, sync_status: 'pending' })
        setDone(true)
      }
    } finally {
      setSaving(false)
    }
  }

  async function saveAndBack() {
    setSaving(true)
    try {
      if (ev.id) await db.encuestas.put({ ...ev, updated_at: new Date().toISOString() })
      setStepIdx(i => Math.max(0, i - 1))
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0d7377]" />
    </div>
  )

  if (done) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      <CheckCircle size={64} className="text-[#0d7377]" />
      <h1 className="text-xl font-bold text-center text-[#0d7377]">¡Encuesta guardada!</h1>
      <p className="text-gray-600 text-center text-sm">
        Los datos se sincronizarán automáticamente cuando haya internet.
      </p>
      <button
        onClick={() => navigate(ev.familia_local_id ? `/familia/${ev.familia_local_id}` : '/')}
        className="bg-[#0d7377] text-white px-6 py-3 rounded-xl font-semibold"
      >
        {ev.familia_local_id ? 'Volver a la familia' : 'Ir al inicio'}
      </button>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col bg-[#f0fafa]">
      <header className="bg-[#0d7377] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-1 rounded"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-xs opacity-80 truncate">{ev.nombre_propietario || 'Nueva encuesta predial'}</p>
          <p className="text-xs opacity-60">Caracterización predial</p>
        </div>
      </header>

      <ProgressBar current={stepIdx} total={total} labels={STEPS.map(s => s.label)} />

      <main className="flex-1 overflow-y-auto px-4 py-5">
        {step.id === 'general'    && <EStep01 data={ev.sec_general}    onChange={handleGeneralChange} />}
        {step.id === 'vivienda'   && <EStep02 data={ev.sec_vivienda}   onChange={v => setEv(p => ({ ...p, sec_vivienda: v }))} />}
        {step.id === 'familia'    && <EStep03 data={ev.sec_familia}    onChange={v => setEv(p => ({ ...p, sec_familia: v }))} />}
        {step.id === 'economia'   && <EStep04 data={ev.sec_economia}   onChange={v => setEv(p => ({ ...p, sec_economia: v }))} />}
        {step.id === 'cultivos'   && <EStep05 data={ev.sec_cultivos}   onChange={v => setEv(p => ({ ...p, sec_cultivos: v }))} />}
        {step.id === 'ganaderia'  && <EStep06 data={ev.sec_ganaderia}  onChange={v => setEv(p => ({ ...p, sec_ganaderia: v }))} />}
        {step.id === 'tecnologia' && <EStep07 data={ev.sec_tecnologia} onChange={v => setEv(p => ({ ...p, sec_tecnologia: v }))} />}
        {step.id === 'bosque'     && <EStep08 data={ev.sec_bosque}     onChange={v => setEv(p => ({ ...p, sec_bosque: v }))} />}
      </main>

      <footer className="bg-white border-t border-gray-100 px-4 py-3 flex gap-3">
        {stepIdx > 0 && (
          <button onClick={saveAndBack} disabled={saving}
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm">
            <ArrowLeft size={16} /> Atrás
          </button>
        )}
        <button onClick={saveAndNext} disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 bg-[#0d7377] text-white py-3 rounded-xl font-semibold text-sm">
          {saving ? <span className="animate-pulse">Guardando…</span>
            : stepIdx === total - 1 ? <><Save size={16} /> Finalizar</>
            : <>Siguiente <ArrowRight size={16} /></>}
        </button>
      </footer>
    </div>
  )
}
