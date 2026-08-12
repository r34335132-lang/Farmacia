export function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function formatMoney(value: number | string | null | undefined): string {
  const amount = Number(value) || 0
  return amount.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatPercent(value: number | string | null | undefined, digits = 1): string {
  return `${(Number(value) || 0).toFixed(digits)}%`
}

export function suggestedSalePrice(cost: number, markupPercent: number): number {
  if (cost <= 0) return 0
  return roundMoney(cost * (1 + (Number(markupPercent) || 0) / 100))
}

export function profitAmount(price: number, cost: number): number {
  return roundMoney((Number(price) || 0) - (Number(cost) || 0))
}

/** Markup / porcentaje de aumento sobre costo. No confundir con margen. */
export function markupPercent(price: number, cost: number): number {
  if (cost <= 0) return 0
  return roundMoney(((Number(price) - Number(cost)) / Number(cost)) * 100)
}

/** Margen sobre precio de venta. */
export function marginPercent(price: number, cost: number): number {
  if (price <= 0) return 0
  return roundMoney(((Number(price) - Number(cost)) / Number(price)) * 100)
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current === 0) return 0
    return null
  }
  return Math.round((((current - previous) / Math.abs(previous)) * 100) * 10) / 10
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

export function expenseCategoryLabel(category: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === category)?.label || category
}
