import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { db } from '../../db/schema'
import { newFamilia } from '../../types/familia'

const MUNICIPIOS = [
  'Albania', 'Belén de los Andaquíes', 'Cartagena del Chairá', 'Curillo',
  'El Doncello', 'El Paujil', 'Florencia', 'La Montañita', 'Milán',
  'Morelia', 'Puerto Rico', 'San José del Fragua', 'San Vicente del Caguán',
  'Solano', 'Solita', 'Valparaíso',
]

export function FamiliaPage() {
  const navigate = useNavigate()
  const [familia, setFamilia] = useState(newFamilia())
  const [saving, setSaving]   = useState(false)
  const [errors, setErrors]   = useState<string[]>([])

  function set<K extends keyof typeof familia>(k: K, v: (typeof familia)[K]) {
    setFamilia(p => ({ ...p, [k]: v }))
    if (errors.length) setErrors([])
  }

  async function handleSave() {
    const errs: string[] = []
    if (!familia.nombre_predio.trim())      errs.push('Nombre del predio')
    if (!familia.nombre_propietario.trim()) errs.push('Nombre del propietario')
    if (!familia.municipio.trim())          errs.push('Municipio')
    if (!familia.fecha.trim())              errs.push('Fecha')
    if (errs.length) { setErrors(errs); return }

    setSaving(true)
    try {
      await db.familias.add({ ...familia, updated_at: new Date().toISOString() })
      navigate(`/familia/${familia.local_id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f0fafa]">

      {/* Header */}
      <header className="bg-[#0d7377] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-1 rounded">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Nueva familia / predio</p>
          <p className="text-xs opacity-60">Paso previo a los formularios</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 space-y-4 pb-24">

        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">
            Campos obligatorios: {errors.join(', ')}
          </div>
        )}

        {/* Nombre del predio */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Nombre del predio <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={familia.nombre_predio}
            onChange={e => set('nombre_predio', e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0d7377]"
            placeholder="Ej: La Esperanza"
          />
        </div>

        {/* Nombre del propietario */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Nombre del propietario <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={familia.nombre_propietario}
            onChange={e => set('nombre_propietario', e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0d7377]"
            placeholder="Ej: Juan Pérez"
          />
        </div>

        {/* Municipio */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Municipio <span className="text-red-500">*</span>
          </label>
          <select
            value={familia.municipio}
            onChange={e => set('municipio', e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0d7377]"
          >
            <option value="">Selecciona un municipio</option>
            {MUNICIPIOS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Vereda */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Vereda</label>
          <input
            type="text"
            value={familia.vereda}
            onChange={e => set('vereda', e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0d7377]"
            placeholder="Ej: Agua Bonita"
          />
        </div>

        {/* Fecha */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Fecha de visita <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={familia.fecha}
            onChange={e => set('fecha', e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0d7377]"
          />
        </div>

        {/* Contacto */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Contacto / teléfono</label>
          <input
            type="tel"
            value={familia.contacto}
            onChange={e => set('contacto', e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0d7377]"
            placeholder="300 000 0000"
          />
        </div>

        {/* Número de zonas */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Número de zonas
            <span className="ml-1 font-normal text-gray-400">(para la evaluación de campo)</span>
          </label>
          <select
            value={familia.num_zonas}
            onChange={e => set('num_zonas', parseInt(e.target.value))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0d7377]"
          >
            {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>{n} zona{n > 1 ? 's' : ''}</option>
            ))}
          </select>
        </div>

      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-[#0d7377] text-white py-3 rounded-xl font-semibold text-sm"
        >
          {saving
            ? <span className="animate-pulse">Guardando…</span>
            : <><Save size={16} /> Crear familia</>}
        </button>
      </footer>
    </div>
  )
}
