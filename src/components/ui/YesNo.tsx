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
          className={`flex-1 min-h-12 py-2.5 px-4 rounded-2xl border-[1.5px] text-[15px] font-semibold transition-all active:scale-[0.98] ${
            val === b
              ? 'boton-bosque border-bosque'
              : 'bg-white border-gray-300 text-gray-800'
          }`}
        >
          {b ? labelYes : labelNo}
        </button>
      ))}
    </div>
  )
}
