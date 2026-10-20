interface ChkGroupProps {
  opts: string[]
  val: string[]
  onChange: (v: string[]) => void
  cols?: number
}

export function ChkGroup({ opts, val, onChange, cols = 2 }: ChkGroupProps) {
  const toggle = (o: string) => {
    onChange(val.includes(o) ? val.filter(x => x !== o) : [...val, o])
  }
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {opts.map(o => (
        <button
          key={o}
          type="button"
          onClick={() => toggle(o)}
          className={`min-h-12 py-2.5 px-3.5 rounded-2xl border-[1.5px] text-[15px] font-medium transition-all text-left flex items-center gap-2.5 active:scale-[0.98] ${
            val.includes(o)
              ? 'boton-bosque border-bosque'
              : 'bg-white border-gray-300 text-gray-800'
          }`}
        >
          <span className={`w-5 h-5 rounded-md border-[1.5px] flex-shrink-0 flex items-center justify-center ${
            val.includes(o) ? 'bg-ambar border-ambar' : 'border-gray-400'
          }`}>
            {val.includes(o) && <span className="text-tinta text-xs font-bold">✓</span>}
          </span>
          {o}
        </button>
      ))}
    </div>
  )
}
