interface ProgressBarProps {
  current: number   // índice actual (0-based)
  total: number
  labels: string[]
}

export function ProgressBar({ current, total, labels }: ProgressBarProps) {
  const pct = Math.round(((current + 1) / total) * 100)

  return (
    <div className="bg-white border-b border-gray-100 px-4 py-3">
      {/* Label actual */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-semibold text-[#0d7377]">
          {labels[current] ?? `Paso ${current + 1}`}
        </span>
        <span className="text-xs text-gray-400">{current + 1} / {total}</span>
      </div>

      {/* Barra */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#0d7377] rounded-full transition-all duration-300"
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
                  ? 'w-3 h-3 bg-[#0d7377]'
                  : i < current
                  ? 'w-2 h-2 bg-[#0d7377]/40 mt-0.5'
                  : 'w-2 h-2 bg-gray-200 mt-0.5'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
