"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Camera, CameraOff } from "lucide-react"

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor
  }
}

export function BarcodeScanner({
  onScan,
  disabled,
}: {
  onScan: (code: string) => void
  disabled?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const lastCodeRef = useRef("")
  const lastAtRef = useRef(0)
  const [active, setActive] = useState(false)
  const [error, setError] = useState("")

  const stop = () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setActive(false)
  }

  useEffect(() => () => stop(), [])

  const start = async () => {
    setError("")
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este teléfono no permite cámara aquí. Escribe el código a mano.")
      return
    }
    if (!window.BarcodeDetector) {
      setError("La cámara de códigos no está disponible en este navegador. Usa Chrome/Safari recientes o escribe el código.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()
      setActive(true)

      const detector = new window.BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
      })

      const tick = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick)
          return
        }
        try {
          const codes = await detector.detect(videoRef.current)
          const value = codes[0]?.rawValue?.trim()
          if (value) {
            const now = Date.now()
            if (value !== lastCodeRef.current || now - lastAtRef.current > 1800) {
              lastCodeRef.current = value
              lastAtRef.current = now
              onScan(value)
            }
          }
        } catch {
          // ignore detect errors on empty frames
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      setError("No se pudo abrir la cámara. Revisa permisos o escribe el código.")
      stop()
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border bg-black">
        <video
          ref={videoRef}
          className="aspect-[4/3] w-full object-cover"
          playsInline
          muted
          autoPlay
        />
        {!active ? (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 p-4 text-center text-sm text-white">
            Apunta la cámara al código de barras, como una pistola
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-400/80" />
        )}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button
        type="button"
        className="w-full"
        variant={active ? "outline" : "default"}
        disabled={disabled}
        onClick={() => (active ? stop() : start())}
      >
        {active ? (
          <>
            <CameraOff className="mr-2 h-4 w-4" />
            Cerrar cámara
          </>
        ) : (
          <>
            <Camera className="mr-2 h-4 w-4" />
            Escanear con cámara
          </>
        )}
      </Button>
    </div>
  )
}
