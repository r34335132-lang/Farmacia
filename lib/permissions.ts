export type AppRole = "admin" | "cajero" | "encargado"

export function isAdminRole(role?: string | null): boolean {
  return role === "admin"
}

export function isBranchRole(role?: string | null): boolean {
  return role === "cajero" || role === "encargado"
}

export function isStaffRole(role?: string | null): boolean {
  return isAdminRole(role) || isBranchRole(role)
}

export const EXPENSE_CATEGORIES = [
  { value: "renta", label: "Renta" },
  { value: "inventario", label: "Inventario" },
  { value: "salarios", label: "Salarios" },
  { value: "servicios", label: "Servicios" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "transporte", label: "Transporte" },
  { value: "otros", label: "Otros" },
] as const

export const SHORTAGE_REASONS = [
  { value: "robo", label: "Robo" },
  { value: "caducado", label: "Caducado" },
  { value: "danado", label: "Dañado" },
  { value: "error_inventario", label: "Error de inventario" },
  { value: "merma", label: "Merma" },
  { value: "otro", label: "Otro" },
] as const

export const SHORTAGE_STATUSES = [
  { value: "pending", label: "Pendiente" },
  { value: "review", label: "Revisión" },
  { value: "approved", label: "Aprobado" },
  { value: "rejected", label: "Rechazado" },
  { value: "charged", label: "Cobrado" },
] as const

export function shortageStatusLabel(status: string) {
  return SHORTAGE_STATUSES.find((s) => s.value === status)?.label || status
}

export function expenseCategoryLabel(category: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === category)?.label || category
}
