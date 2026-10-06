"use client"

import Link from "next/link"
import { ArrowLeft, Menu, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SplitText } from "@/components/motion"
import { useAdminShell } from "@/components/admin-shell"
import type { CSSProperties, ReactNode } from "react"

export function AdminPageHeader({
  title,
  subtitle,
  backHref = "/admin/dashboard",
  actions,
  icon: Icon,
}: {
  title: string
  subtitle?: string
  backHref?: string
  actions?: ReactNode
  icon?: LucideIcon
}) {
  const shell = useAdminShell()

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6 lg:px-8 lg:pt-6">
      <div className="bento anim-rise-sm flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-card/90 px-3 py-2.5 backdrop-blur-md sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {shell ? (
            <Button
              variant="ghost"
              size="icon"
              className="press h-10 w-10 shrink-0 rounded-2xl bg-muted lg:hidden"
              onClick={shell.openNav}
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Menú</span>
            </Button>
          ) : null}
          <Link href={backHref} className="shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="press group h-10 rounded-2xl px-2.5 text-muted-foreground hover:bg-primary/5 hover:text-primary sm:px-3"
            >
              <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-0.5" />
              <span className="hidden sm:inline">Volver</span>
            </Button>
          </Link>
          {Icon ? (
            <span className="anim-pop hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:flex">
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight sm:text-xl">
              <SplitText key={title} text={title} stagger={14} />
            </h1>
            {subtitle ? (
              <p
                className="anim-rise-sm truncate text-xs text-muted-foreground"
                style={{ "--d": "180ms" } as CSSProperties}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
