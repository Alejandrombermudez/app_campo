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
          className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all text-left ${
            val === o
              ? 'bg-[#0d7377] border-[#0d7377] text-white'
              : 'bg-white border-gray-200 text-gray-700 hover:border-[#0d7377]'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}
