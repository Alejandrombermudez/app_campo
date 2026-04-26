interface YesNoProps {
  val: boolean | null
  onChange: (v: boolean) => void
  labelYes?: string
  labelNo?: string
}

export function YesNo({ val, onChange, labelYes = 'Sí', labelNo = 'No' }: YesNoProps) {
  return (
    <div className="flex gap-2">
      {[true, false].map(b => (
        <button
          key={String(b)}
          type="button"
          onClick={() => onChange(b)}
          className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-all ${
            val === b
              ? 'bg-[#0d7377] border-[#0d7377] text-white'
              : 'bg-white border-gray-200 text-gray-700 hover:border-[#0d7377]'
          }`}
        >
          {b ? labelYes : labelNo}
        </button>
      ))}
    </div>
  )
}
