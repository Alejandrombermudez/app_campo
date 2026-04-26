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
          className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all text-left flex items-center gap-2 ${
            val.includes(o)
              ? 'bg-[#0d7377] border-[#0d7377] text-white'
              : 'bg-white border-gray-200 text-gray-700 hover:border-[#0d7377]'
          }`}
        >
          <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
            val.includes(o) ? 'bg-white border-white' : 'border-gray-400'
          }`}>
            {val.includes(o) && <span className="text-[#0d7377] text-xs font-bold">✓</span>}
          </span>
          {o}
        </button>
      ))}
    </div>
  )
}
