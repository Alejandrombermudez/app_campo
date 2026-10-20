interface ProgressBarProps {
  current: number   // índice actual (0-based)
  total: number
  labels: string[]
}

export function ProgressBar({ current, total, labels }: ProgressBarProps) {
  const pct = Math.round(((current + 1) / total) * 100)

  return (
    <div className="tarjeta mx-3 mt-3 px-4 py-3">
      {/* Label actual */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold text-bosque">
          {labels[current] ?? `Paso ${current + 1}`}
        </span>
        <span className="text-xs font-semibold text-gray-600">{current + 1} / {total}</span>
      </div>

      {/* Barra */}
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-bosque to-ambar"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Puntos compactos — solo si ≤ 14 pasos, si no demasiado ancho */}
      {total <= 14 && (
        <div className="flex justify-center gap-1 mt-2">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all ${
                i === current
                  ? 'w-3 h-3 bg-bosque'
                  : i < current
                  ? 'w-2 h-2 bg-bosque/40 mt-0.5'
                  : 'w-2 h-2 bg-gray-200 mt-0.5'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
