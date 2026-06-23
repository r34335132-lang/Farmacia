/**
 * Genera SQL de importación de ventas desde CSV exportado de Supabase (BD vieja).
 *
 * Uso:
 *   node scripts/import-sales-from-csv.mjs "C:\ruta\sales_rows.csv" --branch-id UUID [--cashier-id UUID]
 *
 * --cashier-id opcional: asigna TODAS las ventas a un cajero existente en la BD nueva
 * (útil si los perfiles de la BD vieja no existen en la nueva).
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const csvPath = argv[2]
  let branchId = null
  let cashierId = null
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === "--branch-id" && argv[i + 1]) {
      branchId = argv[i + 1]
      i++
    } else if (argv[i] === "--cashier-id" && argv[i + 1]) {
      cashierId = argv[i + 1]
      i++
    }
  }
  return { csvPath, branchId, cashierId }
}

function parseCsvLine(line) {
  const fields = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      fields.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

function sqlStr(value) {
  if (value === null || value === undefined) return "NULL"
  const trimmed = String(value).trim()
  if (!trimmed) return "NULL"
  return `'${trimmed.replace(/'/g, "''")}'`
}

function sqlNum(value, fallback = "0") {
  if (value === null || value === undefined || String(value).trim() === "") return fallback
  const n = Number(value)
  return Number.isFinite(n) ? String(n) : fallback
}

function sqlTimestamp(value) {
  if (!value || !String(value).trim()) return "NOW()"
  return `${sqlStr(String(value).trim())}::timestamptz`
}

function parseCsv(content) {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  const header = parseCsvLine(lines[0])
  const rows = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const values = parseCsvLine(line)
    const row = {}
    header.forEach((col, idx) => {
      row[col] = values[idx] ?? ""
    })
    rows.push(row)
  }

  return rows
}

function buildInsertChunk(rows, branchId, cashierOverride) {
  const valueRows = []

  for (const row of rows) {
    const id = row.id?.trim()
    if (!id) continue

    const cashierId = cashierOverride || row.cashier_id?.trim()
    if (!cashierId) continue

    const paymentMethod = row.payment_method?.trim() || "efectivo"
    const status = row.status?.trim() || "completed"
    const discountType = row.discount_type?.trim() || "none"

    valueRows.push(
      `('${id}'::uuid, '${cashierId}'::uuid, '${branchId}'::uuid, ${sqlNum(row.total_amount)}, ${sqlStr(paymentMethod)}, ${row.cash_received && String(row.cash_received).trim() ? sqlNum(row.cash_received) : "NULL"}, ${row.change_given && String(row.change_given).trim() ? sqlNum(row.change_given) : "NULL"}, ${sqlStr(status)}, ${sqlTimestamp(row.created_at)}, ${sqlNum(row.subtotal_before_discount || row.total_amount)}, ${sqlStr(discountType)}, ${sqlNum(row.discount_value, "0")}, ${sqlStr(row.discount_reason)})`,
    )
  }

  if (valueRows.length === 0) return ""

  return `INSERT INTO public.sales (
  id,
  cashier_id,
  branch_id,
  total_amount,
  payment_method,
  cash_received,
  change_given,
  status,
  created_at,
  subtotal_before_discount,
  discount_type,
  discount_value,
  discount_reason
) VALUES
${valueRows.join(",\n")}
ON CONFLICT (id) DO UPDATE SET
  cashier_id = EXCLUDED.cashier_id,
  branch_id = EXCLUDED.branch_id,
  total_amount = EXCLUDED.total_amount,
  payment_method = EXCLUDED.payment_method,
  cash_received = EXCLUDED.cash_received,
  change_given = EXCLUDED.change_given,
  status = EXCLUDED.status,
  subtotal_before_discount = EXCLUDED.subtotal_before_discount,
  discount_type = EXCLUDED.discount_type,
  discount_value = EXCLUDED.discount_value,
  discount_reason = EXCLUDED.discount_reason;`
}

function main() {
  const { csvPath, branchId, cashierId } = parseArgs(process.argv)

  if (!csvPath || !branchId) {
    console.error("Faltan argumentos.")
    console.error(
      'Ejemplo: node scripts/import-sales-from-csv.mjs "C:\\Users\\Rafa\\Downloads\\sales_rows.csv" --branch-id 1d7f4fd6-0152-4402-9f4f-6343922841c9',
    )
    process.exit(1)
  }

  const resolved = path.resolve(csvPath)
  if (!fs.existsSync(resolved)) {
    console.error(`No se encontró: ${resolved}`)
    process.exit(1)
  }

  const rows = parseCsv(fs.readFileSync(resolved, "utf8"))
  const chunkSize = 400
  const chunks = []
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize))
  }

  const legacyCashiers = [...new Set(rows.map((r) => r.cashier_id?.trim()).filter(Boolean))]

  const header = `-- Importación de ventas (histórico El Salto)
-- Total ventas: ${rows.length}
-- Sucursal: ${branchId}
-- Cajeros en CSV viejo: ${legacyCashiers.join(", ")}
${cashierId ? `-- Todas asignadas a cajero: ${cashierId}` : `-- Usando cashier_id original del CSV (deben existir en profiles)`}
--
-- ORDEN: 1) productos  2) este archivo  3) sale_items si los tienes
-- Si falla por cashier_id, obtén un UUID válido:
--   SELECT id, full_name FROM profiles WHERE role IN ('cajero','admin');
-- y regenera con: --cashier-id ESE-UUID

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS subtotal_before_discount DECIMAL(10,2);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'none';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_value DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_reason TEXT;

BEGIN;

`

  const footer = `
COMMIT;

SELECT
  COUNT(*) AS ventas_importadas,
  SUM(total_amount) AS total_monto
FROM public.sales
WHERE branch_id = '${branchId}'::uuid;
`

  let sql = header

  for (const chunk of chunks) {
    const insert = buildInsertChunk(chunk, branchId, cashierId)
    if (insert) sql += `\n${insert}\n`
  }

  sql += footer

  const outPath = path.join(__dirname, "generated_import_sales.sql")
  fs.writeFileSync(outPath, sql, "utf8")

  console.log(`Listo: ${rows.length} ventas`)
  console.log(`Archivo: ${outPath}`)
  if (!cashierId) {
    console.log("")
    console.log("NOTA: Si los cajeros de la BD vieja no existen en la nueva,")
    console.log("regenera con --cashier-id <uuid-de-isabel-o-admin>")
  }
}

main()
