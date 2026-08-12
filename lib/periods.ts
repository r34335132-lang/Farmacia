export type PeriodPreset = "day" | "week" | "month" | "custom"

function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function getPeriodRange(preset: PeriodPreset, customStart?: string, customEnd?: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (preset === "day") {
    const iso = toISODate(today)
    return { start: iso, end: iso }
  }

  if (preset === "week") {
    const start = new Date(today)
    start.setDate(today.getDate() - 6)
    return { start: toISODate(start), end: toISODate(today) }
  }

  if (preset === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return { start: toISODate(start), end: toISODate(today) }
  }

  return {
    start: customStart || toISODate(today),
    end: customEnd || toISODate(today),
  }
}
