import { useEffect, useRef, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { EvaluacionPage } from './pages/Evaluacion'
import { EncuestaPage } from './pages/Encuesta'
import { PredioPage } from './pages/Predio'
import { FamiliaPage } from './pages/Familia'
import { FamiliaDetail } from './pages/Familia/FamiliaDetail'
import { CampoViewer } from './pages/Ver/CampoViewer'
import { PredialViewer } from './pages/Ver/PredialViewer'
import { useOnlineStatus } from './lib/useOnlineStatus'
import {
  syncPendingRevisiones,
  syncPendingEvaluaciones,
  syncPendingEncuestas,
  syncPendingPredios,
} from './lib/sync'

// Leaflet + geoman pesan; solo se cargan al entrar al módulo SIG
const SigPage = lazy(() => import('./pages/Sig').then(m => ({ default: m.SigPage })))

function SyncTrigger() {
  const online  = useOnlineStatus()
  const prevRef = useRef(false)

  useEffect(() => {
    if (online && !prevRef.current) {
      const timer = setTimeout(async () => {
        // Revisiones primero: corrigen geo.zonas, de las que depende lo demás
        await syncPendingRevisiones()
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
        <Route path="/familia/nueva"        element={<FamiliaPage />} />
        <Route path="/familia/:id/editar"   element={<FamiliaPage />} />
        <Route path="/familia/:id"          element={<FamiliaDetail />} />
        {/* Módulo SIG: mapa + GPS + corrección de zonas (SIG II) */}
        <Route path="/sig/:id" element={
          <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0d7377]" />
            </div>
          }>
            <SigPage />
          </Suspense>
        } />
        {/* Formulario unificado legacy */}
        <Route path="/predio/nueva"     element={<PredioPage />} />
        <Route path="/predio/:id"       element={<PredioPage />} />
        {/* Visualizadores de registros remotos (solo lectura) */}
        <Route path="/ver/campo/:id"   element={<CampoViewer />} />
        <Route path="/ver/predial/:id" element={<PredialViewer />} />
        {/* Legacy — acceso a registros anteriores */}
        <Route path="/evaluacion/nueva" element={<EvaluacionPage />} />
        <Route path="/evaluacion/:id"   element={<EvaluacionPage />} />
        <Route path="/encuesta/nueva"   element={<EncuestaPage />} />
        <Route path="/encuesta/:id"     element={<EncuestaPage />} />
      </Routes>
    </BrowserRouter>
  )
}
