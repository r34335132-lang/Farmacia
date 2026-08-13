import * as XLSX from "xlsx"
import { normalizeBarcode } from "@/lib/inventory-count"

export type TransferFileRow = {
  barcode: string
  name: string
  quantity: number
}

export type ParseTransferFileResult =
  | { ok: true; rows: TransferFileRow[] }
  | { ok: false; errors: string[] }

const BARCODE_HEADERS = [
  "codigo de barras",
  "codigo",
  "código",
  "barcode",
  "ean",
  "sku",
]

const NAME_HEADERS = ["descripcion", "descripción", "nombre", "name", "producto", "product"]

const QTY_HEADERS = [
  "cantidad",
  "quantity",
  "qty",
  "mot",
  "moto",
  "camioneta",
  "stock",
  "traspaso",
  "transferir",
]

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
    if (candidates.includes(headers[i])) return i
  }
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
    if (candidates.some((c) => h.includes(c) || c.includes(h))) return i
  }
  return -1
}

export async function parseInventoryTransferFile(file: File): Promise<ParseTransferFileResult> {
  const errors: string[] = []
  const name = file.name.toLowerCase()
  if (!(name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls"))) {
    return { ok: false, errors: ["Formato no soportado. Usa .csv, .xlsx o .xls"] }
  }

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: "array", raw: false, cellText: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return { ok: false, errors: ["El archivo no contiene hojas"] }

  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  })

  if (!matrix.length) return { ok: false, errors: ["El archivo está vacío"] }

  const first = matrix[0] || []
  const headerRow = first.map(normalizeHeader)
  let barcodeIdx = findColumn(headerRow, BARCODE_HEADERS)
  let nameIdx = findColumn(headerRow, NAME_HEADERS)
  let qtyIdx = findColumn(headerRow, QTY_HEADERS)
  let dataStart = 1

  const looksLikeData =
    /^\d{6,}$/.test(normalizeBarcode(first[0])) && /^\d+$/.test(String(first[2] ?? "").trim())

  if (barcodeIdx < 0 || qtyIdx < 0) {
    if (looksLikeData) {
      barcodeIdx = 0
      nameIdx = 1
      qtyIdx = 2
      dataStart = 0
    } else {
      return {
        ok: false,
        errors: [
          "El archivo debe incluir columnas: Código / Descripción / Cantidad (o MOT)",
          `Encabezados: ${headerRow.filter(Boolean).join(", ") || "(ninguno)"}`,
        ],
      }
    }
  }

  if (nameIdx < 0) nameIdx = barcodeIdx === 0 ? 1 : -1

  const rows: TransferFileRow[] = []
  const seen = new Map<string, number>()

  for (let r = dataStart; r < matrix.length; r++) {
    const line = matrix[r] || []
    const barcode = normalizeBarcode(line[barcodeIdx])
    const productName = nameIdx >= 0 ? String(line[nameIdx] ?? "").trim() : ""
    const qtyText = String(line[qtyIdx] ?? "").trim().replace(/,/g, "")
    if (!barcode && !productName && !qtyText) continue

    const rowNum = r + 1
    if (!barcode) {
      errors.push(`Fila ${rowNum}: falta código de barras (${productName || "sin nombre"})`)
      continue
    }
    if (!/^\d+$/.test(qtyText) || Number(qtyText) <= 0) {
      errors.push(`Fila ${rowNum} (${barcode}): cantidad inválida`)
      continue
    }
    if (seen.has(barcode)) {
      errors.push(`Código duplicado: ${barcode} (filas ${seen.get(barcode)} y ${rowNum})`)
      continue
    }
    seen.set(barcode, rowNum)
    rows.push({ barcode, name: productName, quantity: Number(qtyText) })
  }

  if (rows.length === 0) errors.push("No se encontraron filas válidas para transferir")
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, rows }
}
