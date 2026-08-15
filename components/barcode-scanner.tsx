"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode"
import { Button } from "@/components/ui/button"
import { Camera, CameraOff } from "lucide-react"

export function BarcodeScanner({
  onScan,
  disabled,
}: {
  onScan: (code: string) => void
  disabled?: boolean
}) {
  const boxId = useId().replace(/:/g, "")
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const lastCodeRef = useRef("")
  const lastAtRef = useRef(0)
  const [active, setActive] = useState(false)
  const [error, setError] = useState("")

  const stop = async () => {
    const scanner = scannerRef.current
    scannerRef.current = null
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop()
      } catch {
        // already stopped
      }
      try {
        scanner.clear()
      } catch {
        // ignore
      }
    }
    setActive(false)
  }

  useEffect(() => {
    return () => {
      void stop()
    }
  }, [])

  const emit = (text: string) => {
    const value = text.trim()
    if (!value) return
    const now = Date.now()
    if (value === lastCodeRef.current && now - lastAtRef.current < 1800) return
    lastCodeRef.current = value
    lastAtRef.current = now
    onScan(value)
  }

  const start = async () => {
    setError("")
    if (typeof window === "undefined") return
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setError("La cámara solo funciona en HTTPS. Abre el sitio seguro o escribe el código / busca por nombre.")
      return
    }

    try {
      await stop()
      const scanner = new Html5Qrcode(boxId, {
        verbose: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        useBarCodeDetectorIfSupported: true,
      })
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 8,
          qrbox: { width: 280, height: 120 },
          aspectRatio: 1.333,
        },
        (decodedText) => emit(decodedText),
        () => undefined,
      )
      setActive(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (/NotAllowedError|Permission/i.test(message)) {
        setError("Permiso de cámara denegado. Actívalo en el navegador o busca por nombre.")
      } else if (/NotFoundError|Requested device not found/i.test(message)) {
        setError("No se encontró cámara. Busca por nombre o código.")
      } else {
        setError("No se pudo abrir la cámara. Prueba Chrome, da permiso, o busca por nombre.")
      }
      await stop()
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border bg-black">
        <div id={boxId} className="min-h-[220px] w-full [&_video]:h-auto [&_video]:w-full [&_video]:object-cover" />
        {!active ? (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/85 p-4 text-center text-sm text-white">
            Apunta al código de barras. Si no abre, busca por nombre abajo.
          </div>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button
        type="button"
        className="h-12 w-full"
        variant={active ? "outline" : "default"}
        disabled={disabled}
        onClick={() => (active ? void stop() : void start())}
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
