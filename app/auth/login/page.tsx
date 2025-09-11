"use client"

import type React from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect } from "react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const urlMessage = searchParams.get("message")
    if (urlMessage) {
      setMessage(urlMessage)
    }
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)
    setMessage(null)

    try {
      console.log("[v0] Intentando login con:", email)

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.log("[v0] Error de autenticación:", error)
        throw error
      }

      console.log("[v0] Usuario autenticado:", data.user.id)

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, is_active, full_name, email")
        .eq("id", data.user.id)
        .single()

      console.log("[v0] Resultado búsqueda perfil:", { profile, profileError })

      if (profileError) {
        console.log("[v0] Perfil no encontrado, creando uno nuevo")
        // Si no existe el perfil, crear uno básico
        const { data: newProfile, error: createError } = await supabase
          .from("profiles")
          .insert({
            id: data.user.id,
            email: data.user.email || email,
            full_name: email.split("@")[0],
            role: "cajero",
            is_active: true,
          })
          .select("role, is_active, full_name")
          .single()

        if (createError) {
          console.log("[v0] Error creando perfil:", createError)
          throw new Error("Error al crear perfil de usuario")
        }

        console.log("[v0] Perfil creado, redirigiendo a POS")
        router.push("/pos")
        return
      }

      if (!profile.is_active) {
        throw new Error("Tu cuenta está desactivada. Contacta al administrador.")
      }

      console.log("[v0] Perfil encontrado, rol:", profile.role)

      if (profile.role === "admin") {
        router.push("/admin/dashboard")
      } else {
        router.push("/pos")
      }
    } catch (error: unknown) {
      console.log("[v0] Error final:", error)
      setError(error instanceof Error ? error.message : "Error al iniciar sesión")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/10 p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-primary">Farmacia Solidaria</CardTitle>
            <CardDescription>Ingresa tus credenciales para acceder al sistema</CardDescription>
          </CardHeader>
          <CardContent>
            {message && (
              <div className="mb-4 text-sm text-green-600 bg-green-50 p-3 rounded-md border border-green-200">
                {message}
              </div>
            )}
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@farmacia.com o cajero@farmacia.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="admin123 o cajero123"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Iniciando sesión..." : "Iniciar Sesión"}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              <div className="bg-blue-50 p-3 rounded-md border border-blue-200 text-blue-800">
                <strong>Usuarios de prueba:</strong>
                <br />
                Admin: admin@farmacia.com / admin123
                <br />
                Cajero: cajero@farmacia.com / cajero123
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
