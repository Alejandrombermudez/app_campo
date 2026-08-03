import { useState } from 'react'
import { User, Lock, Pencil } from 'lucide-react'

interface Props {
  onComplete: (name: string) => void
}

/** Espacios repetidos/­al inicio o final tal como pueden salir del teclado del celular. */
function normalizar(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ')
}

export function UserSetup({ onComplete }: Props) {
  const [name, setName]     = useState('')
  const [step, setStep]     = useState<'escribir' | 'confirmar'>('escribir')

  function irAConfirmar() {
    if (!normalizar(name)) return
    setStep('confirmar')
  }

  function confirmar() {
    const final = normalizar(name)
    localStorage.setItem('ae_campo_user', final)
    onComplete(final)
  }

  if (step === 'confirmar') {
    const final = normalizar(name)
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
              <Lock size={26} className="text-amber-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 text-center">Confirma tu nombre</h2>
            <p className="text-sm text-gray-500 text-center">
              Este nombre quedará fijo en <strong>este celular</strong> y no se podrá cambiar
              después — así se identifica quién diligenció cada formulario y se evita que
              alguien lo llene dos veces.
            </p>
          </div>

          <p className="text-center text-lg font-semibold text-gray-800 bg-gray-50 rounded-xl py-3 px-4">
            {final}
          </p>

          <div className="space-y-2">
            <button
              onClick={confirmar}
              className="w-full bg-[#0d7377] text-white py-3 rounded-xl font-semibold"
            >
              Sí, este es mi nombre — continuar
            </button>
            <button
              onClick={() => setStep('escribir')}
              className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 py-2"
            >
              <Pencil size={13}/> Corregir
            </button>
          </div>
        </div>
      </div>
    )
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
            Escríbelo completo, como firmarías un formulario. Se usará para identificar tus
            evaluaciones y quedará fijo en este dispositivo.
          </p>
        </div>

        <input
          type="text"
          autoFocus
          placeholder="Tu nombre completo"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && irAConfirmar()}
          className="w-full"
        />

        <button
          onClick={irAConfirmar}
          disabled={!normalizar(name)}
          className="w-full bg-[#0d7377] text-white py-3 rounded-xl font-semibold disabled:opacity-40"
        >
          Continuar
        </button>
      </div>
    </div>
  )
}
