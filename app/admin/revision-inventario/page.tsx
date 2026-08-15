"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { InventoryRevision } from "@/components/inventory-revision"

export default function AdminRevisionInventarioPage() {
  const router = useRouter()
  const supabase = createClient()
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const boot = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login")
        return
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      if (profile?.role !== "admin") {
        router.push("/cajero/revision")
        return
      }
      const res = await fetch("/api/branches")
      if (res.ok) {
        const json = await res.json()
        setBranches(json.branches || [])
      }
      setReady(true)
    }
    boot()
  }, [router, supabase])

  if (!ready) {
    return <p className="p-6 text-muted-foreground">Cargando...</p>
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader
        title="Revisión de inventario"
        subtitle="Escanea, compara con el sistema y arma el descuento de la sucursal"
      />
      <div className="mx-auto max-w-lg p-4 sm:p-6">
        <InventoryRevision isAdmin assignedBranches={branches} />
      </div>
    </div>
  )
}
