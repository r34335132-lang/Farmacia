export type PeriodPreset = "day" | "week" | "month" | "custom"

function toLocalISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function todayLocalISODate(): string {
  return toLocalISODate(new Date())
}

export function getPeriodRange(preset: PeriodPreset, customStart?: string, customEnd?: string) {
  const today = new Date()
  today.setHours(12, 0, 0, 0)

  if (preset === "day") {
    const iso = toLocalISODate(today)
    return { start: iso, end: iso }
  }

  if (preset === "week") {
    const start = new Date(today)
    start.setDate(today.getDate() - 6)
    return { start: toLocalISODate(start), end: toLocalISODate(today) }
  }

  if (preset === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return { start: toLocalISODate(start), end: toLocalISODate(today) }
  }

  return {
    start: customStart || toLocalISODate(today),
    end: customEnd || toLocalISODate(today),
  }
}
