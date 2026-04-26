import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Save, CheckCircle } from 'lucide-react'
import { db } from '../../db/schema'
import type {
  EvaluacionRecord, ZonaData,
  SeccionIdentificacion, SeccionCartografia,
  SeccionCobertura, SeccionSuelo, SeccionLogistica,
  SeccionRiesgos, SeccionFirmas,
} from '../../types/evaluacion'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { Step01 } from './Step01_Identificacion'
import { Step02 } from './Step02_CartografiaSocial'
import { Step03 } from './Step03_CoberturaVegetal'
import { Step04 } from './Step04_SueloTopografia'
import { Step05 } from './Step05_LogisticaAcceso'
import { Step06 } from './Step06_RiesgosRestricciones'
import { Step07 } from './Step07_Firmas'

// ─── Descriptor de paso ──────────────────────────────────────────────────────
interface StepDescriptor {
  id: string
  label: string
  zona?: number
}

function buildSteps(numZonas: number): StepDescriptor[] {
  const steps: StepDescriptor[] = [
    { id: 'identificacion', label: '§1 Identificación' },
    { id: 'cartografia',    label: '§2 Cartografía Social' },
  ]
  for (let z = 1; z <= Math.max(1, numZonas); z++) {
    steps.push({ id: `cobertura_z${z}`, label: `§3 Cobertura — Zona ${z}`, zona: z })
    steps.push({ id: `suelo_z${z}`,     label: `§4 Suelo — Zona ${z}`,     zona: z })
    steps.push({ id: `logistica_z${z}`, label: `§5 Logística — Zona ${z}`, zona: z })
  }
  steps.push({ id: 'riesgos', label: '§6 Riesgos' })
  steps.push({ id: 'firmas',  label: 'Firmas' })
  return steps
}

function emptyZona(n: number): ZonaData {
  return { zona_numero: n, cobertura: {}, suelo: {}, logistica: {} }
}

function newEvaluacion(): EvaluacionRecord {
  return {
    local_id:       crypto.randomUUID(),
    supabase_id:    null,
    sync_status:    'pending',
    sync_error:     null,
    created_at:     new Date().toISOString(),
    updated_at:     new Date().toISOString(),
    step_completed: 0,
    created_by:     localStorage.getItem('ae_campo_user') ?? '',
    nombre_predio:  '',
    codigo_predio:  '',
    municipio:      '',
    fecha_visita:   '',
    num_zonas:      1,
    seccion_1:      { codigo_formato: 'AE-CAMPO-001', version: '1.0', num_zonas: 1 },
    seccion_2:      {},
    zonas:          [emptyZona(1)],
    seccion_6:      {},
    seccion_7:      {},
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function EvaluacionPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()

  const [ev, setEv]           = useState<EvaluacionRecord>(newEvaluacion())
  const [stepIdx, setStepIdx] = useState(0)
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false)
  const [loaded, setLoaded]   = useState(false)

  // Cargar evaluación existente
  useEffect(() => {
    if (!id) { setLoaded(true); return }
    db.evaluaciones.where('local_id').equals(id).first().then(found => {
      if (found) {
        setEv(found)
        setStepIdx(found.step_completed ?? 0)
      }
      setLoaded(true)
    })
  }, [id])

  const numZonas = ev.seccion_1.num_zonas ?? 1
  const steps    = buildSteps(numZonas)
  const total    = steps.length
  const step     = steps[stepIdx]

  // ─── Actualizar sección 1 y sincronizar zonas ─────────────────────────────
  function handleS1Change(s1: Partial<SeccionIdentificacion>) {
    const newNumZonas = s1.num_zonas ?? numZonas
    let zonas = ev.zonas

    if (newNumZonas > zonas.length) {
      // Agregar zonas vacías
      zonas = [
        ...zonas,
        ...Array.from({ length: newNumZonas - zonas.length }, (_, i) => emptyZona(zonas.length + i + 1)),
      ]
    } else if (newNumZonas < zonas.length) {
      // Confirmar si hay datos en las zonas a eliminar
      const toRemove = zonas.slice(newNumZonas)
      const hasData  = toRemove.some(z =>
        Object.keys(z.cobertura).length > 0 ||
        Object.keys(z.suelo).length > 0 ||
        Object.keys(z.logistica).length > 0
      )
      if (hasData && !window.confirm(`¿Eliminar datos de las zonas ${newNumZonas + 1}–${zonas.length}?`)) {
        return
      }
      zonas = zonas.slice(0, newNumZonas)
    }

    setEv(prev => ({
      ...prev,
      seccion_1:    { ...prev.seccion_1, ...s1 },
      zonas,
      num_zonas:    newNumZonas,
      nombre_predio: s1.nombre_predio ?? prev.nombre_predio,
      codigo_predio: s1.codigo_predio ?? prev.codigo_predio,
      municipio:     s1.municipio    ?? prev.municipio,
      fecha_visita:  s1.fecha_visita ?? prev.fecha_visita,
    }))
  }

  // ─── Guardar paso y avanzar ───────────────────────────────────────────────
  async function saveAndNext() {
    setSaving(true)
    const updated: EvaluacionRecord = {
      ...ev,
      step_completed: Math.max(ev.step_completed, stepIdx),
      updated_at: new Date().toISOString(),
    }

    try {
      if (updated.id) {
        await db.evaluaciones.put(updated)
      } else {
        const newId = await db.evaluaciones.add(updated)
        updated.id = newId
        setEv(updated)
      }

      if (stepIdx < total - 1) {
        setStepIdx(i => i + 1)
      } else {
        // Último paso → finalizar
        await db.evaluaciones.update(updated.id!, {
          step_completed: total - 1,
          sync_status:    'pending',
        })
        setDone(true)
      }
    } finally {
      setSaving(false)
    }
  }

  async function saveAndBack() {
    setSaving(true)
    try {
      if (ev.id) await db.evaluaciones.put({ ...ev, updated_at: new Date().toISOString() })
      setStepIdx(i => Math.max(0, i - 1))
    } finally {
      setSaving(false)
    }
  }

  // ─── Actualizar zona específica ───────────────────────────────────────────
  function setZona(zonaNum: number, key: 'cobertura' | 'suelo' | 'logistica', val: unknown) {
    setEv(prev => ({
      ...prev,
      zonas: prev.zonas.map(z =>
        z.zona_numero === zonaNum ? { ...z, [key]: val } : z
      ),
    }))
  }

  if (!loaded) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0d7377]" />
    </div>
  )

  // Pantalla de finalización
  if (done) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      <CheckCircle size={64} className="text-[#0d7377]" />
      <h1 className="text-xl font-bold text-center text-[#0d7377]">¡Evaluación guardada!</h1>
      <p className="text-gray-600 text-center text-sm">
        Los datos se guardarán localmente y se sincronizarán con el servidor cuando haya internet.
      </p>
      <button
        onClick={() => navigate('/')}
        className="bg-[#0d7377] text-white px-6 py-3 rounded-xl font-semibold"
      >
        Ir al inicio
      </button>
    </div>
  )

  const zona      = step.zona ?? 1
  const zonaData  = ev.zonas.find(z => z.zona_numero === zona) ?? emptyZona(zona)

  return (
    <div className="min-h-screen flex flex-col bg-[#f0fafa]">
      {/* Header */}
      <header className="bg-[#0d7377] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-1 rounded">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs opacity-80 truncate">
            {ev.nombre_predio || 'Nueva evaluación'}
          </p>
          <p className="text-xs opacity-60">AE-CAMPO-001</p>
        </div>
      </header>

      {/* Barra de progreso */}
      <ProgressBar
        current={stepIdx}
        total={total}
        labels={steps.map(s => s.label)}
      />

      {/* Contenido del paso */}
      <main className="flex-1 overflow-y-auto px-4 py-5">
        {step.id === 'identificacion' && (
          <Step01 data={ev.seccion_1} onChange={handleS1Change} />
        )}
        {step.id === 'cartografia' && (
          <Step02
            data={ev.seccion_2}
            onChange={s2 => setEv(p => ({ ...p, seccion_2: { ...p.seccion_2, ...(s2 as Partial<SeccionCartografia>) } }))}
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
            localEvaluacionId={ev.local_id}
            data={zonaData.suelo}
            onChange={v => setZona(zona, 'suelo', v as Partial<SeccionSuelo>)}
          />
        )}
        {step.id.startsWith('logistica_z') && (
          <Step05
            zona={zona}
            localEvaluacionId={ev.local_id}
            data={zonaData.logistica}
            onChange={v => setZona(zona, 'logistica', v as Partial<SeccionLogistica>)}
          />
        )}
        {step.id === 'riesgos' && (
          <Step06
            data={ev.seccion_6}
            onChange={s6 => setEv(p => ({ ...p, seccion_6: { ...p.seccion_6, ...(s6 as Partial<SeccionRiesgos>) } }))}
          />
        )}
        {step.id === 'firmas' && (
          <Step07
            data={ev.seccion_7}
            onChange={s7 => setEv(p => ({ ...p, seccion_7: { ...p.seccion_7, ...(s7 as Partial<SeccionFirmas>) } }))}
            evaluador1={ev.seccion_1.evaluador_1 ?? ''}
            evaluador2={ev.seccion_1.evaluador_2 ?? ''}
          />
        )}
      </main>

      {/* Botones de navegación */}
      <footer className="bg-white border-t border-gray-100 px-4 py-3 flex gap-3">
        {stepIdx > 0 && (
          <button
            onClick={saveAndBack}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm"
          >
            <ArrowLeft size={16} /> Atrás
          </button>
        )}
        <button
          onClick={saveAndNext}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 bg-[#0d7377] text-white py-3 rounded-xl font-semibold text-sm"
        >
          {saving ? (
            <span className="animate-pulse">Guardando…</span>
          ) : stepIdx === total - 1 ? (
            <><Save size={16} /> Finalizar</>
          ) : (
            <>Siguiente <ArrowRight size={16} /></>
          )}
        </button>
      </footer>
    </div>
  )
}
