interface RadioGrpProps {
  opts: string[]
  val: string
  onChange: (v: string) => void
  cols?: number
}

export function RadioGrp({ opts, val, onChange, cols = 2 }: RadioGrpProps) {
  return (
    <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {opts.map(o => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(val === o ? '' : o)}
          className={`min-h-12 py-2.5 px-3.5 rounded-2xl border-[1.5px] text-[15px] font-medium transition-all text-left active:scale-[0.98] ${
            val === o
              ? 'boton-bosque border-bosque'
              : 'bg-white border-gray-300 text-gray-800'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}
