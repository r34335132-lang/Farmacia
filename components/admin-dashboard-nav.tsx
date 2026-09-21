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

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-muted/80",
        item.tone === "pos" && "bg-rose-50 text-rose-900 hover:bg-rose-100",
        item.tone === "store" && "hover:bg-primary/5",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground",
          item.tone === "pos" && "text-rose-700",
          item.tone === "store" && "text-primary",
        )}
      />
      <span className="min-w-0">
        <span className="block font-medium leading-tight">{item.title}</span>
        {item.description ? (
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{item.description}</span>
        ) : null}
      </span>
    </Link>
  )
}

function NavGroupBlock({
  group,
  onNavigate,
}: {
  group: NavGroup
  onNavigate?: () => void
}) {
  const [open, setOpen] = useState(Boolean(group.defaultOpen))

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/50">
        {group.title}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-0.5 pb-2 pt-0.5">
        {group.items.map((item) => (
          <NavLink key={item.href + item.title} item={item} onNavigate={onNavigate} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function AdminDashboardNav({
  onNavigate,
  className,
}: {
  onNavigate?: () => void
  className?: string
}) {
  return (
    <nav className={cn("flex h-full flex-col", className)}>
      <div className="space-y-1 border-b px-3 py-4">
        <Link
          href="/admin/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-lg bg-primary/10 px-2.5 py-2.5 text-sm font-semibold text-primary"
        >
          <LayoutDashboard className="h-4 w-4" />
          Resumen
        </Link>
        <Link
          href="/pos"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2.5 text-sm font-semibold text-rose-900 hover:bg-rose-100"
        >
          <ShoppingCart className="h-4 w-4" />
          Punto de venta
        </Link>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {DASHBOARD_NAV_GROUPS.map((group) => (
          <NavGroupBlock key={group.id} group={group} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  )
}
