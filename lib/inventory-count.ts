import * as XLSX from "xlsx"

export type InventoryCountRow = {
  barcode: string
  name: string
  quantity: number
}

export type ParseInventoryFileResult =
  | { ok: true; rows: InventoryCountRow[] }
  | { ok: false; errors: string[] }

const BARCODE_HEADERS = [
  "codigo de barras",
  "código de barras",
  "codigo_barras",
  "código_barras",
  "barcode",
  "codigo",
  "código",
  "ean",
  "sku",
]

const NAME_HEADERS = ["nombre", "name", "producto", "product", "descripcion", "descripción"]

const QTY_HEADERS = ["cantidad", "quantity", "qty", "conteo", "stock", "existencias", "fisico", "físico"]

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

function findColumn(headers: string[], candidates: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
    if (candidates.includes(h)) return i
  }
  // coincidencia parcial
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
    if (candidates.some((c) => h.includes(c) || c.includes(h))) return i
  }
  return -1
}

export function normalizeBarcode(value: unknown): string {
  if (value == null) return ""
  let raw = String(value).trim()
  if (!raw) return ""

  if (/^\d+(\.\d+)?e[+-]?\d+$/i.test(raw)) {
    const n = Number(raw)
    if (Number.isFinite(n) && Number.isInteger(n)) {
      raw = String(n)
    }
  }

  if (/^\d+\.0+$/.test(raw)) {
    raw = raw.replace(/\.0+$/, "")
  }

  return raw
}

export async function parseInventoryCountFile(file: File): Promise<ParseInventoryFileResult> {
  const errors: string[] = []
  const name = file.name.toLowerCase()
  const allowed = name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls")
  if (!allowed) {
    return { ok: false, errors: ["Formato no soportado. Usa .csv, .xlsx o .xls"] }
  }

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: "array", raw: false, cellText: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { ok: false, errors: ["El archivo no contiene hojas"] }
  }

  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  })

  if (!matrix.length) {
    return { ok: false, errors: ["El archivo está vacío"] }
  }

  const headerRow = (matrix[0] || []).map(normalizeHeader)
  const barcodeIdx = findColumn(headerRow, BARCODE_HEADERS)
  const nameIdx = findColumn(headerRow, NAME_HEADERS)
  const qtyIdx = findColumn(headerRow, QTY_HEADERS)

  if (barcodeIdx < 0 || nameIdx < 0 || qtyIdx < 0) {
    return {
      ok: false,
      errors: [
        "El archivo debe incluir las columnas: Código de barras, Nombre y Cantidad",
        `Encabezados detectados: ${headerRow.filter(Boolean).join(", ") || "(ninguno)"}`,
      ],
    }
  }

  const rows: InventoryCountRow[] = []
  const seen = new Map<string, number>()

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r] || []
    const barcode = normalizeBarcode(line[barcodeIdx])
    const productName = String(line[nameIdx] ?? "").trim()
    const qtyCell = line[qtyIdx]
    const qtyText = String(qtyCell ?? "").trim().replace(/,/g, "")

    // Filas totalmente vacías
    if (!barcode && !productName && !qtyText) continue

    const rowNum = r + 1

    if (!barcode) {
      errors.push(`Fila ${rowNum}: falta código de barras`)
      continue
    }

    if (qtyText === "") {
      errors.push(`Fila ${rowNum} (${barcode}): falta cantidad`)
      continue
    }

    if (!/^\d+$/.test(qtyText)) {
      errors.push(`Fila ${rowNum} (${barcode}): la cantidad debe ser un entero >= 0 (recibido: ${qtyText})`)
      continue
    }

    const quantity = Number(qtyText)
    if (!Number.isInteger(quantity) || quantity < 0) {
      errors.push(`Fila ${rowNum} (${barcode}): cantidad inválida`)
      continue
    }

    if (seen.has(barcode)) {
      errors.push(
        `Código de barras duplicado: ${barcode} (filas ${seen.get(barcode)} y ${rowNum})`,
      )
      continue
    }

    seen.set(barcode, rowNum)
    rows.push({ barcode, name: productName, quantity })
  }

  if (rows.length === 0) {
    errors.push("No se encontraron filas válidas para comparar")
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return { ok: true, rows }
}

export function exportInventoryCountCsv(
  rows: Array<{
    barcode: string
    product_name: string
    system_stock: number
    counted: number
    difference: number
    status: string
  }>,
  statusLabel: (status: string) => string,
): string {
  const header = [
    "Código de barras",
    "Producto",
    "Stock sistema",
    "Conteo físico",
    "Diferencia",
    "Estado",
  ]

  const escape = (value: string | number) => {
    const text = String(value ?? "")
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
    return text
  }

  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        escape(row.barcode),
        escape(row.product_name),
        escape(row.system_stock),
        escape(row.counted),
        escape(row.difference > 0 ? `+${row.difference}` : row.difference),
        escape(statusLabel(row.status)),
      ].join(","),
    ),
  ]

  return `\uFEFF${lines.join("\n")}`
}
