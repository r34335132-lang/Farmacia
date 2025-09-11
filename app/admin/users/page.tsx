"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ArrowLeft, Plus, Edit, Users, UserCheck, UserX } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

interface Profile {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  created_at: string
}

export default function UserManagement() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    role: "cajero",
    password: "",
  })
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    checkAuth()
    loadProfiles()
  }, [])

  const checkAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push("/auth/login")
      return
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "admin") {
      router.push("/pos")
      return
    }
  }

  const loadProfiles = async () => {
    try {
      const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false })

      setProfiles(data || [])
    } catch (error) {
      console.error("Error loading profiles:", error)
      toast({
        title: "Error",
        description: "No se pudieron cargar los usuarios",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (editingUser) {
        // Update existing user
        const { error } = await supabase
          .from("profiles")
          .update({
            full_name: formData.full_name,
            role: formData.role,
          })
          .eq("id", editingUser.id)

        if (error) throw error

        toast({
          title: "Usuario actualizado",
          description: "Los datos del usuario se actualizaron correctamente",
        })
      } else {
        console.log("[v0] Creando nuevo cajero:", formData.email)

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            emailRedirectTo: undefined,
            data: {
              full_name: formData.full_name,
              role: formData.role,
            },
          },
        })

        console.log("[v0] Resultado auth.signUp:", { authData, authError })

        if (authError) {
          console.error("[v0] Error en signUp:", authError)
          throw authError
        }

        if (authData.user) {
          console.log("[v0] Usuario creado en auth, insertando perfil...")

          // Insertar perfil en la tabla profiles
          const { error: profileError } = await supabase.from("profiles").insert([
            {
              id: authData.user.id,
              email: formData.email,
              full_name: formData.full_name,
              role: formData.role,
              is_active: true,
            },
          ])

          if (profileError && !profileError.message.includes("duplicate")) {
            console.error("[v0] Error insertando perfil:", profileError)
            throw profileError
          }

          console.log("[v0] Perfil insertado correctamente")
        }

        toast({
          title: "Cajero creado exitosamente",
          description: `${formData.full_name} puede iniciar sesión inmediatamente con email: ${formData.email}`,
        })
      }

      setIsDialogOpen(false)
      setEditingUser(null)
      setFormData({ email: "", full_name: "", role: "cajero", password: "" })
      loadProfiles()
    } catch (error) {
      console.error("Error saving user:", error)
      toast({
        title: "Error",
        description: "No se pudo guardar el usuario",
        variant: "destructive",
      })
    }
  }

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase.from("profiles").update({ is_active: !currentStatus }).eq("id", userId)

      if (error) throw error

      toast({
        title: "Estado actualizado",
        description: `Usuario ${!currentStatus ? "activado" : "desactivado"} correctamente`,
      })

      loadProfiles()
    } catch (error) {
      console.error("Error updating user status:", error)
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado del usuario",
        variant: "destructive",
      })
    }
  }

  const openEditDialog = (user: Profile) => {
    setEditingUser(user)
    setFormData({
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      password: "",
    })
    setIsDialogOpen(true)
  }

  const openCreateDialog = () => {
    setEditingUser(null)
    setFormData({ email: "", full_name: "", role: "cajero", password: "" })
    setIsDialogOpen(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Cargando usuarios...</div>
      </div>
    )
  }

  const activeUsers = profiles.filter((p) => p.is_active).length
  const adminUsers = profiles.filter((p) => p.role === "admin").length
  const cashierUsers = profiles.filter((p) => p.role === "cajero").length

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/admin/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-primary">Gestión de Usuarios</h1>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Usuario
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingUser ? "Editar Usuario" : "Crear Nuevo Usuario"}</DialogTitle>
                <DialogDescription>
                  {editingUser
                    ? "Modifica los datos del usuario seleccionado"
                    : "Completa los datos para crear un nuevo usuario"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      disabled={!!editingUser}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="full_name">Nombre Completo</Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="role">Rol</Label>
                    <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cajero">Cajero</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {!editingUser && (
                    <div>
                      <Label htmlFor="password">Contraseña</Label>
                      <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required={!editingUser}
                      />
                    </div>
                  )}
                </div>
                <DialogFooter className="mt-6">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">{editingUser ? "Actualizar" : "Crear"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Usuarios</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{profiles.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usuarios Activos</CardTitle>
              <UserCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{activeUsers}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Administradores</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{adminUsers}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cajeros</CardTitle>
              <UserX className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{cashierUsers}</div>
            </CardContent>
          </Card>
        </div>

        {/* Users List */}
        <Card>
          <CardHeader>
            <CardTitle>Lista de Usuarios</CardTitle>
            <CardDescription>Administra los usuarios del sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {profiles.map((profile) => (
                <div key={profile.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-medium">{profile.full_name}</p>
                      <p className="text-sm text-muted-foreground">{profile.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Creado: {new Date(profile.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={profile.role === "admin" ? "default" : "secondary"}>{profile.role}</Badge>
                    <Badge variant={profile.is_active ? "default" : "destructive"}>
                      {profile.is_active ? "Activo" : "Inactivo"}
                    </Badge>

                    <Button variant="outline" size="sm" onClick={() => openEditDialog(profile)}>
                      <Edit className="h-4 w-4" />
                    </Button>

                    <Button
                      variant={profile.is_active ? "destructive" : "default"}
                      size="sm"
                      onClick={() => toggleUserStatus(profile.id, profile.is_active)}
                    >
                      {profile.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ))}

              {profiles.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">No hay usuarios registrados</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
