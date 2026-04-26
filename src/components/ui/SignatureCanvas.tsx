import { useRef, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'

interface SignatureCanvasProps {
  label: string
  value: string | null
  onChange: (dataURL: string | null) => void
}

export function SignatureCanvas({ label, value, onChange }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)
  const [isEmpty, setIsEmpty] = useState(!value)

  // Cargar firma existente al montar
  useEffect(() => {
    if (!value || !canvasRef.current) return
    const img = new Image()
    img.onload = () => {
      const ctx = canvasRef.current!.getContext('2d')!
      ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height)
      ctx.drawImage(img, 0, 0)
      setIsEmpty(false)
    }
    img.src = value
  }, [])

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const rect = canvasRef.current!.getBoundingClientRect()
    const scaleX = canvasRef.current!.width  / rect.width
    const scaleY = canvasRef.current!.height / rect.height
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top)  * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    setIsEmpty(false)
  }

  function endDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!drawing.current) return
    drawing.current = false
    const dataURL = canvasRef.current!.toDataURL('image/png')
    onChange(dataURL)
  }

  function clear() {
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height)
    setIsEmpty(true)
    onChange(null)
  }

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {!isEmpty && (
          <button type="button" onClick={clear} className="text-red-500 flex items-center gap-1 text-xs">
            <Trash2 size={12} /> Borrar
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={400}
        height={160}
        className="w-full border-2 border-dashed border-gray-300 rounded-lg bg-white touch-none cursor-crosshair"
        style={{ maxHeight: 160 }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      {isEmpty && (
        <p className="text-xs text-gray-400 text-center -mt-6 pointer-events-none">
          Firmar aquí
        </p>
      )}
    </div>
  )
}
