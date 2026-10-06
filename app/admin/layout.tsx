"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { AdminShell } from "@/components/admin-shell"

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (pathname?.startsWith("/admin/dashboard")) return <>{children}</>
  return <AdminShell>{children}</AdminShell>
}
