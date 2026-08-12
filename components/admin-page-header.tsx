"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ReactNode } from "react"

export function AdminPageHeader({
  title,
  subtitle,
  backHref = "/admin/dashboard",
  actions,
}: {
  title: string
  subtitle?: string
  backHref?: string
  actions?: ReactNode
}) {
  return (
    <header className="border-b bg-white">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={backHref}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-primary sm:text-xl">{title}</h1>
            {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
