import { useEffect, useRef, useState } from 'react'
import { Camera, X, Eye, Loader2 } from 'lucide-react'
import { db } from '../../db/schema'

interface PhotoCaptureProps {
  fieldKey: string
  localEvaluacionId: string
  currentPhotoId: number | null
  onCapture: (photoId: number) => void
  onRemove: () => void
  referenceImage?: string   // path relativo a /ref-images/
  referenceLabel?: string
}

// Compresión máxima: redimensiona a max 800px y calidad JPEG 0.45
// Reduce fotos de ~5 MB a ~40-80 KB — suficiente para campo
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 800
      let { width, height } = img
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height)
        width  = Math.round(width  * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width  = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(blob => resolve(blob ?? file), 'image/jpeg', 0.45)
    }
    img.src = url
  })
}

export function PhotoCapture({
  fieldKey, localEvaluacionId, currentPhotoId,
  onCapture, onRemove, referenceImage, referenceLabel,
}: PhotoCaptureProps) {
  const inputRef  = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showRef, setShowRef] = useState(false)

  // Cargar preview si ya existe foto
  useEffect(() => {
    if (!currentPhotoId) { setPreview(null); return }
    db.photos.get(currentPhotoId).then(p => {
      if (p) setPreview(URL.createObjectURL(p.blob))
    })
  }, [currentPhotoId])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const blob = await compressImage(file)
      const id = await db.photos.add({
        local_evaluacion_id: localEvaluacionId,
        field_key: fieldKey,
        blob,
        mime_type: 'image/jpeg',
        filename: `${fieldKey}.jpg`,
        uploaded_url: null,
        sync_status: 'pending',
      })
      setPreview(URL.createObjectURL(blob))
      onCapture(id as number)
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleRemove() {
    setPreview(null)
    onRemove()
  }

  return (
    <div className="space-y-2">
      {preview ? (
        <div className="relative">
          <img src={preview} alt="foto" className="w-full rounded-lg object-cover max-h-48" />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="w-full border-2 border-dashed border-gray-300 rounded-lg py-6 flex flex-col items-center gap-2 text-gray-500 hover:border-[#0d7377] hover:text-[#0d7377] transition-colors"
        >
          {loading ? <Loader2 size={24} className="animate-spin" /> : <Camera size={24} />}
          <span className="text-sm">{loading ? 'Procesando…' : 'Tomar foto / Galería'}</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      {referenceImage && (
        <>
          <button
            type="button"
            onClick={() => setShowRef(true)}
            className="flex items-center gap-1 text-xs text-[#0d7377] underline"
          >
            <Eye size={13} /> {referenceLabel ?? 'Ver imagen de referencia'}
          </button>

          {showRef && (
            <div
              className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
              onClick={() => setShowRef(false)}
            >
              <div className="relative max-w-sm w-full" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setShowRef(false)}
                  className="absolute -top-3 -right-3 bg-white rounded-full p-1 shadow"
                >
                  <X size={16} />
                </button>
                <img
                  src={referenceImage}
                  alt={referenceLabel}
                  className="w-full rounded-xl shadow-xl"
                />
                {referenceLabel && (
                  <p className="text-white text-center text-sm mt-2">{referenceLabel}</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
