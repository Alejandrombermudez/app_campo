import { Plus, Trash2 } from 'lucide-react'
import type { CultivoRow } from '../../types/encuesta'

interface Props { data: CultivoRow[]; onChange: (d: CultivoRow[]) => void }

const CULTIVOS_BASE = ['Café','Cacao','Caña de azúcar','Plátano','Yuca','Frutales','Madera']
const DESTINOS = ['Consumo familiar','Venta local','Venta a intermediarios','Exportación']
const emptyCultivo = (nombre = ''): CultivoRow => ({ cultivo: nombre, area_ha: '', anio_siembra: '', densidad: '', rendimiento: '', destino: '' })

export function EStep05({ data, onChange }: Props) {
  const rows = data.length > 0 ? data : CULTIVOS_BASE.map(emptyCultivo)

  function setCell(i: number, k: keyof CultivoRow, v: string) {
    onChange(rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
  }
  function addRow() { onChange([...rows, emptyCultivo()]) }
  function removeRow(i: number) {
    if (CULTIVOS_BASE.includes(rows[i].cultivo)) {
      // Resetear fila base en lugar de eliminar
      onChange(rows.map((r, idx) => idx === i ? emptyCultivo(r.cultivo) : r))
    } else {
      onChange(rows.filter((_, idx) => idx !== i))
    }
  }

  const headers = ['Cultivo','Área (ha)','Año siembra','Densidad (pl/ha)','Rendimiento (kg/ha)','Destino*']

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-[#0d7377]">§6A Cultivos</h2>
      <p className="text-xs text-gray-500">Completa solo los cultivos que apliquen. Deja en blanco lo que no corresponda.</p>

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-xs border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-[#0d7377]/10">
              {headers.map(h => (
                <th key={h} className="px-2 py-2 text-left font-semibold text-[#0d7377] border border-[#0d7377]/20">{h}</th>
              ))}
              <th className="px-2 py-2 border border-[#0d7377]/20 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="border border-gray-100 px-1 py-1">
                  {CULTIVOS_BASE.includes(row.cultivo)
                    ? <span className="px-2 font-medium text-gray-700">{row.cultivo}</span>
                    : <input type="text" placeholder="Otro cultivo" value={row.cultivo} onChange={e => setCell(i, 'cultivo', e.target.value)} className="text-xs w-24" />
                  }
                </td>
                {(['area_ha','anio_siembra','densidad','rendimiento'] as (keyof CultivoRow)[]).map(k => (
                  <td key={k} className="border border-gray-100 px-1 py-1">
                    <input type="text" value={row[k]} onChange={e => setCell(i, k, e.target.value)} className="text-xs w-full" />
                  </td>
                ))}
                <td className="border border-gray-100 px-1 py-1">
                  <select value={row.destino} onChange={e => setCell(i, 'destino', e.target.value)} className="text-xs w-full">
                    <option value="">—</option>
                    {DESTINOS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </td>
                <td className="border border-gray-100 px-1 py-1 text-center">
                  <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-400">
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-2 text-sm text-[#0d7377] border border-dashed border-[#0d7377]/30 rounded-xl px-4 py-2"
      >
        <Plus size={14} /> Agregar otro cultivo
      </button>

      <p className="text-xs text-gray-400">* Destinos: Consumo familiar / Venta local / Venta a intermediarios / Exportación</p>
    </div>
  )
}
