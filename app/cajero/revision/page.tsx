"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { InventoryRevision } from "@/components/inventory-revision"
import { ArrowLeft } from "lucide-react"

export default function CajeroRevisionPage() {
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
      <header className="sticky top-0 z-10 border-b bg-white">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/cajero">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-base font-bold text-primary">Revisión de inventario</h1>
            <p className="text-xs text-muted-foreground">Escanea y anota cuántas piezas hay</p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-lg p-4">
        <InventoryRevision isAdmin={false} assignedBranches={branches} />
      </div>
    </div>
  )
}
