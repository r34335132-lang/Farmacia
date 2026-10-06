"use client"

import type React from "react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Upload, X, ImageIcon } from "lucide-react"

interface ImageUploadProps {
  onImageUploaded: (url: string) => void
  currentImage?: string
  className?: string
}

export function ImageUpload({ onImageUploaded, currentImage, className }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(currentImage || null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Por favor selecciona un archivo de imagen válido")
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("El archivo es muy grande. Máximo 5MB")
      return
    }

    setUploading(true)

    try {
      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)

      // Upload to Vercel Blob
      const filename = `products/${Date.now()}-${file.name}`
      const response = await fetch(`/api/upload?filename=${encodeURIComponent(filename)}`, {
        method: "POST",
        body: file,
      })

      if (!response.ok) {
        throw new Error("Error al subir la imagen")
      }

      const blob = await response.json()
      onImageUploaded(blob.url)
    } catch (error) {
      console.error("Error uploading image:", error)
      alert("Error al subir la imagen. Inténtalo de nuevo.")
      setPreview(currentImage || null)
    } finally {
      setUploading(false)
    }
  }

  const handleButtonClick = () => {
    fileInputRef.current?.click()
  }

  const removeImage = () => {
    setPreview(null)
    onImageUploaded("")
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <div className={className}>
      <Label htmlFor="image-upload">Imagen del Producto</Label>
      <div className="mt-2">
        {preview ? (
          <div className="relative inline-block">
            <img
              src={preview || "/placeholder.svg"}
              alt="Preview"
              className="h-36 w-36 rounded-2xl border object-cover shadow-sm"
            />
            {uploading && (
              <div className="absolute inset-0 grid place-items-center rounded-2xl bg-background/70 text-xs font-medium">
                Subiendo...
              </div>
            )}
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="absolute -top-2 -right-2 h-7 w-7 rounded-full p-0 shadow-md"
              onClick={removeImage}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleButtonClick}
            disabled={uploading}
            className="flex h-36 w-36 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-foreground/15 bg-muted/40 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/[0.04] hover:text-primary"
          >
            <ImageIcon className="h-8 w-8" />
            <span className="text-xs font-medium">{uploading ? "Subiendo..." : "Agregar foto"}</span>
          </button>
        )}

        <div className="mt-2">
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={handleButtonClick}
            className="w-36 cursor-pointer rounded-xl bg-transparent"
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? "Subiendo..." : preview ? "Cambiar" : "Subir imagen"}
          </Button>
        </div>
      </div>
    </div>
  )
}
