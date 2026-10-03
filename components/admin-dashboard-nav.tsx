"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Package,
  ScanBarcode,
  ShoppingCart,
  Users,
  TrendingUp,
  DollarSign,
  Sparkles,
  Store,
  ClipboardList,
  Wallet,
  Truck,
  ClipboardCheck,
  ScrollText,
  Percent,
  History,
  ClipboardPenLine,
  ArrowRightLeft,
  PiggyBank,
  LayoutDashboard,
  ChevronDown,
  AlertTriangle,
  Trophy,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

export type NavItem = {
  href: string
  title: string
  description?: string
  icon: LucideIcon
  tone?: "default" | "pos" | "store"
}

export type NavGroup = {
  id: string
  title: string
  items: NavItem[]
  defaultOpen?: boolean
}

export const DASHBOARD_NAV_GROUPS: NavGroup[] = [
  {
    id: "inventario",
    title: "Inventario",
    defaultOpen: true,
    items: [
      { href: "/admin/products", title: "Productos", description: "Catálogo y precios", icon: Package },
      { href: "/admin/products/agregado-rapido", title: "Agregado rápido", description: "Escanear y sumar stock", icon: ScanBarcode },
      { href: "/admin/inventario", title: "Conteo", description: "Excel vs stock real", icon: ClipboardPenLine },
      { href: "/admin/inventario/pedido", title: "Pedir stock", description: "Proveedor y sucursal", icon: Package },
      { href: "/admin/revision-inventario", title: "Revisión", description: "Escanear y contar", icon: ClipboardCheck },
      { href: "/admin/traspasos", title: "Traspasos", description: "Entre sucursales", icon: ArrowRightLeft },
      { href: "/admin/movimientos", title: "Movimientos", description: "Entradas y salidas", icon: History },
      { href: "/admin/distribuidora", title: "Distribuidora", description: "Entradas y alertas", icon: Truck },
      { href: "/admin/faltantes", title: "Faltantes", description: "Revisión y cobro", icon: ClipboardCheck },
      { href: "/admin/alertas", title: "Alertas stock/caducidad", description: "Bajo, vencidos y por vencer", icon: AlertTriangle },
    ],
  },
  {
    id: "dinero",
    title: "Dinero",
    defaultOpen: true,
    items: [
      { href: "/admin/sales", title: "Ventas", description: "Reportes e historial", icon: TrendingUp },
      { href: "/admin/mas-vendidos", title: "Más vendidos", description: "Ranking por periodo", icon: Trophy },
      { href: "/admin/finanzas", title: "Finanzas", description: "Utilidad y márgenes", icon: DollarSign },
      { href: "/admin/inversion", title: "Inversión", description: "Valor del inventario", icon: PiggyBank },
      { href: "/admin/gastos", title: "Gastos", description: "Nómina y operativos", icon: Wallet },
      { href: "/admin/markup", title: "Markup / precios", description: "Aumento sobre costo", icon: Percent },
    ],
  },
  {
    id: "pedidos",
    title: "Pedidos",
    items: [
      { href: "/admin/pedidos-globales", title: "Pedidos sucursales", description: "Lo pedido en caja", icon: ClipboardList },
      { href: "/admin/orders", title: "Pedidos online", description: "Atender clientes", icon: ClipboardList },
    ],
  },
  {
    id: "tienda",
    title: "Tienda",
    items: [
      { href: "/tienda", title: "Tienda pública", description: "Vista del cliente", icon: Store, tone: "store" },
      { href: "/admin/promotions", title: "Promociones", description: "Ofertas activas", icon: Sparkles, tone: "store" },
      { href: "/cajero", title: "Panel cajero", description: "Pedidos e inventario", icon: ClipboardList, tone: "store" },
    ],
  },
  {
    id: "sistema",
    title: "Sistema",
    items: [
      { href: "/admin/users", title: "Usuarios", description: "Cajeros y permisos", icon: Users },
      { href: "/admin/branches", title: "Sucursales", description: "Farmacias", icon: Store },
      { href: "/admin/auditoria", title: "Auditoría", description: "Historial de cambios", icon: ScrollText },
    ],
  },
]

type NavVariant = "light" | "dark"

function NavLink({ item, onNavigate, variant }: { item: NavItem; onNavigate?: () => void; variant: NavVariant }) {
  const Icon = item.icon
  const dark = variant === "dark"
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-3 rounded-2xl px-2.5 py-2 text-sm transition-colors",
        dark ? "text-white/80 hover:bg-white/10 hover:text-white" : "hover:bg-primary/5",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors",
          dark
            ? "bg-white/5 text-white/70 group-hover:bg-white/15 group-hover:text-white"
            : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium leading-tight">{item.title}</span>
        {item.description ? (
          <span
            className={cn(
              "mt-0.5 block truncate text-[11px] leading-snug",
              dark ? "text-white/45" : "text-muted-foreground",
            )}
          >
            {item.description}
          </span>
        ) : null}
      </span>
    </Link>
  )
}

function NavGroupBlock({
  group,
  onNavigate,
  variant,
}: {
  group: NavGroup
  onNavigate?: () => void
  variant: NavVariant
}) {
  const [open, setOpen] = useState(Boolean(group.defaultOpen))
  const dark = variant === "dark"

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em]",
          dark ? "text-white/40 hover:text-white/70" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {group.title}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-0.5 pb-3 pt-0.5">
        {group.items.map((item) => (
          <NavLink key={item.href + item.title} item={item} onNavigate={onNavigate} variant={variant} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function AdminDashboardNav({
  onNavigate,
  className,
  variant = "light",
}: {
  onNavigate?: () => void
  className?: string
  variant?: NavVariant
}) {
  const dark = variant === "dark"
  return (
    <nav className={cn("flex h-full flex-col", className)}>
      <div className="space-y-1.5 px-3 pb-3 pt-2">
        <Link
          href="/admin/dashboard"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-2xl px-2.5 py-2 text-sm font-semibold",
            dark ? "bg-white text-primary shadow-sm" : "bg-primary text-primary-foreground shadow-sm",
          )}
        >
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl",
              dark ? "bg-primary/10" : "bg-white/15",
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
          </span>
          Resumen
        </Link>
        <Link
          href="/pos"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-2xl px-2.5 py-2 text-sm font-semibold transition-colors",
            dark
              ? "bg-white/10 text-white ring-1 ring-white/10 hover:bg-white/15"
              : "bg-primary/10 text-primary hover:bg-primary/15",
          )}
        >
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl",
              dark ? "bg-white/10" : "bg-white",
            )}
          >
            <ShoppingCart className="h-4 w-4" />
          </span>
          Punto de venta
        </Link>
      </div>

      <div className={cn("scrollbar-thin flex-1 space-y-1 overflow-y-auto px-2 py-2", dark && "[scrollbar-color:rgb(255_255_255/0.15)_transparent]")}>
        {DASHBOARD_NAV_GROUPS.map((group) => (
          <NavGroupBlock key={group.id} group={group} onNavigate={onNavigate} variant={variant} />
        ))}
      </div>
    </nav>
  )
}
