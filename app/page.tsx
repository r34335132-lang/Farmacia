"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

export default function HomePage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push("/auth/login")
      return
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("email", user.email).single()

    if (!profile) {
      await supabase.from("profiles").insert({
        id: user.id,
        email: user.email || "",
        full_name: user.email?.split("@")[0] || "Usuario",
        role: "cajero",
        is_active: true,
      })
      router.push("/pos")
      return
    }

    if (profile.role === "admin") {
      router.push("/admin/dashboard")
    } else {
      router.push("/pos")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-lg">Redirigiendo...</div>
    </div>
  )
}
