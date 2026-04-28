import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { EvaluacionPage } from './pages/Evaluacion'
import { EncuestaPage } from './pages/Encuesta'
import { PredioPage } from './pages/Predio'
import { FamiliaPage } from './pages/Familia'
import { FamiliaDetail } from './pages/Familia/FamiliaDetail'
import { useOnlineStatus } from './lib/useOnlineStatus'
import {
  syncPendingFamilias,
  syncPendingEvaluaciones,
  syncPendingEncuestas,
  syncPendingPredios,
} from './lib/sync'

function SyncTrigger() {
  const online  = useOnlineStatus()
  const prevRef = useRef(false)

  useEffect(() => {
    if (online && !prevRef.current) {
      const timer = setTimeout(async () => {
        // Familias primero (hijos necesitan el predio_id del padre)
        await syncPendingFamilias()
        syncPendingEvaluaciones()
        syncPendingEncuestas()
        syncPendingPredios()
      }, 2000)
      return () => clearTimeout(timer)
    }
    prevRef.current = online
  }, [online])

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <SyncTrigger />
      <Routes>
        <Route path="/"                 element={<Home />} />
        {/* Familia (nuevo flujo padre-hijos) */}
        <Route path="/familia/nueva"    element={<FamiliaPage />} />
        <Route path="/familia/:id"      element={<FamiliaDetail />} />
        {/* Formulario unificado legacy */}
        <Route path="/predio/nueva"     element={<PredioPage />} />
        <Route path="/predio/:id"       element={<PredioPage />} />
        {/* Legacy — acceso a registros anteriores */}
        <Route path="/evaluacion/nueva" element={<EvaluacionPage />} />
        <Route path="/evaluacion/:id"   element={<EvaluacionPage />} />
        <Route path="/encuesta/nueva"   element={<EncuestaPage />} />
        <Route path="/encuesta/:id"     element={<EncuestaPage />} />
      </Routes>
    </BrowserRouter>
  )
}
