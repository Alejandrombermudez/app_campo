import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Save, CheckCircle } from 'lucide-react'
import { db } from '../../db/schema'
import type { PredioRecord, ZonaData } from '../../types/predio'
import { newPredio, emptyZona } from '../../types/predio'
import type {
  SeccionCartografia, SeccionCobertura, SeccionSuelo,
  SeccionLogistica, SeccionRiesgos, SeccionFirmas,
} from '../../types/evaluacion'
import type {
  EncuestaVivienda, EncuestaFamilia, EncuestaEconomia,
  CultivoRow, EncuestaGanaderia, EncuestaTecnologia, EncuestaBosque,
} from '../../types/encuesta'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { PStep01 } from './PStep01_Identificacion'
import { Step02 } from '../Evaluacion/Step02_CartografiaSocial'
import { Step03 } from '../Evaluacion/Step03_CoberturaVegetal'
import { Step04 } from '../Evaluacion/Step04_SueloTopografia'
import { Step05 } from '../Evaluacion/Step05_LogisticaAcceso'
import { Step06 } from '../Evaluacion/Step06_RiesgosRestricciones'
import { Step07 } from '../Evaluacion/Step07_Firmas'
import { EStep02 } from '../Encuesta/EStep02_Vivienda'
import { EStep03 } from '../Encuesta/EStep03_Familia'
import { EStep04 } from '../Encuesta/EStep04_Economia'
import { EStep05 } from '../Encuesta/EStep05_Cultivos'
import { EStep06 } from '../Encuesta/EStep06_Ganaderia'
import { EStep07 } from '../Encuesta/EStep07_Tecnologia'
import { EStep08 } from '../Encuesta/EStep08_BosqueRelaciones'

// ─── Descriptor de paso ───────────────────────────────────────────────────────
interface StepDescriptor {
  id: string
  label: string
  zona?: number
  cat: 'general' | 'campo' | 'predial'
}

function buildSteps(numZonas: number): StepDescriptor[] {
  const steps: StepDescriptor[] = [
    { id: 'ident',       label: '§1 Identificación',  cat: 'general' },
    { id: 'cartografia', label: 'C· Cartografía',      cat: 'campo'   },
  ]
  const n = Math.max(1, numZonas)
  for (let z = 1; z <= n; z++) {
    steps.push({ id: `cobertura_z${z}`, label: `C· Cobertura Z${z}`, zona: z, cat: 'campo'   })
    steps.push({ id: `suelo_z${z}`,     label: `C· Suelo Z${z}`,     zona: z, cat: 'campo'   })
    steps.push({ id: `logistica_z${z}`, label: `C· Logística Z${z}`, zona: z, cat: 'campo'   })
  }
  steps.push({ id: 'riesgos',    label: 'C· Riesgos',    cat: 'campo'   })
  steps.push({ id: 'vivienda',   label: 'P· Vivienda',   cat: 'predial' })
  steps.push({ id: 'familia',    label: 'P· Familia',    cat: 'predial' })
  steps.push({ id: 'economia',   label: 'P· Economía',   cat: 'predial' })
  steps.push({ id: 'cultivos',   label: 'P· Cultivos',   cat: 'predial' })
  steps.push({ id: 'ganaderia',  label: 'P· Ganadería',  cat: 'predial' })
  steps.push({ id: 'tecnologia', label: 'P· Tecnología', cat: 'predial' })
  steps.push({ id: 'bosque',     label: 'P· Bosque',     cat: 'predial' })
  steps.push({ id: 'firmas',     label: 'Firmas',        cat: 'general' })
  return steps
}

// ─── Badge de categoría ───────────────────────────────────────────────────────
function CatBadge({ cat }: { cat: StepDescriptor['cat'] }) {
  if (cat === 'campo')   return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white/90">CAMPO</span>
  if (cat === 'predial') return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-400/30 text-emerald-100">PREDIAL</span>
  return null
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function PredioPage() {
  const { id }   = useParams<{ id?: string }>()
  const navigate = useNavigate()

  const [predio, setPredio] = useState<PredioRecord>(newPredio())
  const [stepIdx, setStepIdx] = useState(0)
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false)
  const [loaded, setLoaded]   = useState(false)

  useEffect(() => {
    if (!id) { setLoaded(true); return }
    db.predios.where('local_id').equals(id).first().then(found => {
      if (found) { setPredio(found); setStepIdx(found.step_completed ?? 0) }
      setLoaded(true)
    })
  }, [id])

  const steps = buildSteps(predio.num_zonas)
  const total = steps.length
  const step  = steps[stepIdx]
  const zona  = step.zona ?? 1
  const zonaData: ZonaData = predio.zonas.find(z => z.zona_numero === zona) ?? emptyZona(zona)

  // ─── Actualizar §1 + gestionar zonas ────────────────────────────────────────
  function handleIdent(update: Partial<PredioRecord>) {
    const newNum = (update.num_zonas != null) ? update.num_zonas : predio.num_zonas
    let zonas = predio.zonas

    if (newNum !== predio.num_zonas) {
      if (newNum > zonas.length) {
        zonas = [
          ...zonas,
          ...Array.from({ length: newNum - zonas.length }, (_, i) => emptyZona(zonas.length + i + 1)),
        ]
      } else if (newNum < zonas.length) {
        const toRemove = zonas.slice(newNum)
        const hasData  = toRemove.some(z =>
          Object.keys(z.cobertura).length > 0 ||
          Object.keys(z.suelo).length > 0 ||
          Object.keys(z.logistica).length > 0
        )
        if (hasData && !window.confirm(`¿Eliminar datos de las zonas ${newNum + 1}–${zonas.length}?`)) return
        zonas = zonas.slice(0, newNum)
      }
    }

    setPredio(p => ({ ...p, ...update, zonas }))
  }

  // ─── Actualizar zona específica ──────────────────────────────────────────────
  function setZona(zonaNum: number, key: 'cobertura' | 'suelo' | 'logistica', val: unknown) {
    setPredio(p => ({
      ...p,
      zonas: p.zonas.map(z => z.zona_numero === zonaNum ? { ...z, [key]: val } : z),
    }))
  }

  // ─── Guardar y avanzar ───────────────────────────────────────────────────────
  async function saveAndNext() {
    setSaving(true)
    const updated: PredioRecord = {
      ...predio,
      step_completed: Math.max(predio.step_completed, stepIdx),
      updated_at: new Date().toISOString(),
    }
    try {
      if (updated.id) {
        await db.predios.put(updated)
      } else {
        const newId = await db.predios.add(updated)
        updated.id  = newId
        setPredio(updated)
      }
      if (stepIdx < total - 1) {
        setStepIdx(i => i + 1)
      } else {
        await db.predios.update(updated.id!, { step_completed: total - 1, sync_status: 'pending' })
        setDone(true)
      }
    } finally {
      setSaving(false)
    }
  }

  async function saveAndBack() {
    setSaving(true)
    try {
      if (predio.id) await db.predios.put({ ...predio, updated_at: new Date().toISOString() })
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
      <h1 className="text-xl font-bold text-center text-[#0d7377]">¡Formulario guardado!</h1>
      <p className="text-gray-600 text-center text-sm">
        Los datos se sincronizarán automáticamente cuando haya internet.
      </p>
      <button onClick={() => navigate('/')} className="bg-[#0d7377] text-white px-6 py-3 rounded-xl font-semibold">
        Ir al inicio
      </button>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col bg-[#f0fafa]">

      {/* Header */}
      <header className="bg-[#0d7377] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-1 rounded"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs opacity-80 truncate">{predio.nombre_predio || 'Nuevo formulario'}</p>
            <CatBadge cat={step.cat} />
          </div>
          <p className="text-xs opacity-60">Caracterización predial</p>
        </div>
      </header>

      <ProgressBar current={stepIdx} total={total} labels={steps.map(s => s.label)} />

      <main className="flex-1 overflow-y-auto px-4 py-5">

        {step.id === 'ident' && (
          <PStep01 data={predio} onChange={handleIdent} />
        )}

        {step.id === 'cartografia' && (
          <Step02
            data={predio.sec_cartografia}
            onChange={v => setPredio(p => ({ ...p, sec_cartografia: { ...p.sec_cartografia, ...(v as Partial<SeccionCartografia>) } }))}
          />
        )}

        {step.id.startsWith('cobertura_z') && (
          <Step03
            zona={zona}
            data={zonaData.cobertura}
            onChange={v => setZona(zona, 'cobertura', v as Partial<SeccionCobertura>)}
          />
        )}

        {step.id.startsWith('suelo_z') && (
          <Step04
            zona={zona}
            localEvaluacionId={predio.local_id}
            data={zonaData.suelo}
            onChange={v => setZona(zona, 'suelo', v as Partial<SeccionSuelo>)}
          />
        )}

        {step.id.startsWith('logistica_z') && (
          <Step05
            zona={zona}
            localEvaluacionId={predio.local_id}
            data={zonaData.logistica}
            onChange={v => setZona(zona, 'logistica', v as Partial<SeccionLogistica>)}
          />
        )}

        {step.id === 'riesgos' && (
          <Step06
            data={predio.sec_riesgos}
            onChange={v => setPredio(p => ({ ...p, sec_riesgos: { ...p.sec_riesgos, ...(v as Partial<SeccionRiesgos>) } }))}
          />
        )}

        {step.id === 'vivienda' && (
          <EStep02 data={predio.sec_vivienda} onChange={v => setPredio(p => ({ ...p, sec_vivienda: v as Partial<EncuestaVivienda> }))} />
        )}

        {step.id === 'familia' && (
          <EStep03 data={predio.sec_familia} onChange={v => setPredio(p => ({ ...p, sec_familia: v as Partial<EncuestaFamilia> }))} />
        )}

        {step.id === 'economia' && (
          <EStep04 data={predio.sec_economia} onChange={v => setPredio(p => ({ ...p, sec_economia: v as Partial<EncuestaEconomia> }))} />
        )}

        {step.id === 'cultivos' && (
          <EStep05 data={predio.sec_cultivos} onChange={v => setPredio(p => ({ ...p, sec_cultivos: v as CultivoRow[] }))} />
        )}

        {step.id === 'ganaderia' && (
          <EStep06 data={predio.sec_ganaderia} onChange={v => setPredio(p => ({ ...p, sec_ganaderia: v as Partial<EncuestaGanaderia> }))} />
        )}

        {step.id === 'tecnologia' && (
          <EStep07 data={predio.sec_tecnologia} onChange={v => setPredio(p => ({ ...p, sec_tecnologia: v as Partial<EncuestaTecnologia> }))} />
        )}

        {step.id === 'bosque' && (
          <EStep08 data={predio.sec_bosque} onChange={v => setPredio(p => ({ ...p, sec_bosque: v as Partial<EncuestaBosque> }))} />
        )}

        {step.id === 'firmas' && (
          <Step07
            data={predio.sec_firmas}
            onChange={v => setPredio(p => ({ ...p, sec_firmas: { ...p.sec_firmas, ...(v as Partial<SeccionFirmas>) } }))}
            evaluador1={predio.evaluador_1}
            evaluador2={predio.evaluador_2}
          />
        )}
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
