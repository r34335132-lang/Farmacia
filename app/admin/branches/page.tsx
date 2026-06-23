"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ArrowLeft, Plus, Edit, Store, MapPin, Phone } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Branch {
  id: string
  name: string
  address?: string | null
  phone?: string | null
  is_active: boolean
  created_at?: string
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
  })
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    checkAuth()
    loadBranches()
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
    }
  }

  const loadBranches = async () => {
    try {
      const res = await fetch("/api/branches?manage=true")
      if (!res.ok) throw new Error("No se pudieron cargar las sucursales")
      const data = await res.json()
      setBranches(data.branches || [])
    } catch (error) {
      console.error(error)
      toast({
        title: "Error",
        description: "No se pudieron cargar las sucursales",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast({ title: "Error", description: "El nombre es obligatorio", variant: "destructive" })
      return
    }

    try {
      const payload = {
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
      }

      const res = await fetch("/api/branches", {
        method: editingBranch ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingBranch ? { id: editingBranch.id, ...payload } : payload),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Error al guardar")

      toast({
        title: editingBranch ? "Sucursal actualizada" : "Sucursal creada",
        description: `${formData.name} guardada correctamente`,
      })

      setIsDialogOpen(false)
      setEditingBranch(null)
      setFormData({ name: "", address: "", phone: "" })
      loadBranches()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo guardar",
        variant: "destructive",
      })
    }
  }

  const toggleBranchStatus = async (branch: Branch) => {
    try {
      const res = await fetch("/api/branches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: branch.id, is_active: !branch.is_active }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)

      toast({
        title: "Estado actualizado",
        description: `${branch.name} ${!branch.is_active ? "activada" : "desactivada"}`,
      })
      loadBranches()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo actualizar",
        variant: "destructive",
      })
    }
  }

  const openCreateDialog = () => {
    setEditingBranch(null)
    setFormData({ name: "", address: "", phone: "" })
    setIsDialogOpen(true)
  }

  const openEditDialog = (branch: Branch) => {
    setEditingBranch(branch)
    setFormData({
      name: branch.name,
      address: branch.address || "",
      phone: branch.phone || "",
    })
    setIsDialogOpen(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Cargando sucursales...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/admin/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
            </Link>
            <Store className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Gestionar Sucursales</h1>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Sucursal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingBranch ? "Editar Sucursal" : "Nueva Sucursal"}</DialogTitle>
                <DialogDescription>
                  {editingBranch
                    ? "Modifica los datos de la sucursal"
                    : "Crea una nueva farmacia o punto de venta"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Farmacia Centro"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Dirección</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Calle, colonia, ciudad"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(618) 000-0000"
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">{editingBranch ? "Guardar cambios" : "Crear sucursal"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Sucursales registradas</CardTitle>
            <CardDescription>
              Cada sucursal tiene su propio inventario, stock y ventas. Los cajeros se asignan desde Usuarios.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {branches.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No hay sucursales. Crea la primera con el botón &quot;Nueva Sucursal&quot;.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {branches.map((branch) => (
                  <Card key={branch.id} className={!branch.is_active ? "opacity-60" : ""}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Store className="h-5 w-5 text-primary" />
                          {branch.name}
                        </CardTitle>
                        <Badge variant={branch.is_active ? "default" : "secondary"}>
                          {branch.is_active ? "Activa" : "Inactiva"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {branch.address && (
                        <p className="text-sm text-muted-foreground flex items-start gap-2">
                          <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                          {branch.address}
                        </p>
                      )}
                      {branch.phone && (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <Phone className="h-4 w-4 shrink-0" />
                          {branch.phone}
                        </p>
                      )}
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(branch)}>
                          <Edit className="h-4 w-4 mr-1" />
                          Editar
                        </Button>
                        <Button
                          variant={branch.is_active ? "destructive" : "default"}
                          size="sm"
                          onClick={() => toggleBranchStatus(branch)}
                        >
                          {branch.is_active ? "Desactivar" : "Activar"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
