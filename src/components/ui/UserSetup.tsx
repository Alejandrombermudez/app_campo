import { useState } from 'react'
import { User } from 'lucide-react'

interface Props {
  onComplete: (name: string) => void
}

export function UserSetup({ onComplete }: Props) {
  const [name, setName] = useState('')

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    localStorage.setItem('ae_campo_user', trimmed)
    onComplete(trimmed)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-[#0d7377]/10 flex items-center justify-center">
            <User size={28} className="text-[#0d7377]" />
          </div>
          <h2 className="text-lg font-bold text-gray-800 text-center">¿Cuál es tu nombre?</h2>
          <p className="text-sm text-gray-500 text-center">
            Se usará para identificar tus evaluaciones en la base de datos.
          </p>
        </div>

        <input
          type="text"
          autoFocus
          placeholder="Tu nombre completo"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          className="w-full"
        />

        <button
          onClick={submit}
          disabled={!name.trim()}
          className="w-full bg-[#0d7377] text-white py-3 rounded-xl font-semibold disabled:opacity-40"
        >
          Continuar
        </button>
      </div>
    </div>
  )
}
