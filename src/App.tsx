import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { EvaluacionPage } from './pages/Evaluacion'
import { useOnlineStatus } from './lib/useOnlineStatus'
import { syncPendingEvaluaciones } from './lib/sync'

function SyncTrigger() {
  const online  = useOnlineStatus()
  const prevRef = useRef(false)

  useEffect(() => {
    if (online && !prevRef.current) {
      const timer = setTimeout(() => { syncPendingEvaluaciones() }, 2000)
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
        <Route path="/evaluacion/nueva" element={<EvaluacionPage />} />
        <Route path="/evaluacion/:id"   element={<EvaluacionPage />} />
      </Routes>
    </BrowserRouter>
  )
}
