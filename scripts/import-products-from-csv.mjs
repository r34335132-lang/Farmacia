/**
 * Genera SQL de importación desde CSV exportado de Supabase (BD vieja).
 *
 * Uso:
 *   node scripts/import-products-from-csv.mjs "C:\ruta\products_rows.csv" --branch-id TU-UUID-AQUI
 *
 * Salida: scripts/generated_import_products.sql
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const csvPath = argv[2]
  let branchId = null
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === "--branch-id" && argv[i + 1]) {
      branchId = argv[i + 1]
      i++
    }
  }
  return { csvPath, branchId }
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

function sqlBool(value, fallback = true) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return fallback ? "true" : "false"
  }
  const v = String(value).trim().toLowerCase()
  return v === "true" || v === "t" || v === "1" ? "true" : "false"
}

function cleanDate(...candidates) {
  for (const raw of candidates) {
    if (!raw || !String(raw).trim()) continue
    const datePart = String(raw).trim().split(" ")[0]
    const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) continue
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (year < 2000 || year > 2100) continue
    if (month < 1 || month > 12 || day < 1 || day > 31) continue
    return datePart
  }
  return null
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

function main() {
  const { csvPath, branchId } = parseArgs(process.argv)

  if (!csvPath) {
    console.error("Falta ruta del CSV.")
    console.error(
      'Ejemplo: node scripts/import-products-from-csv.mjs "C:\\Users\\Rafa\\Downloads\\products_rows (1).csv" --branch-id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    )
    process.exit(1)
  }

  const resolved = path.resolve(csvPath)
  if (!fs.existsSync(resolved)) {
    console.error(`No se encontró el archivo: ${resolved}`)
    process.exit(1)
  }

  const placeholder = branchId || "__PEGAR_UUID_SUCURSAL_AQUI__"
  const rows = parseCsv(fs.readFileSync(resolved, "utf8"))

  const valueRows = []
  let skipped = 0

  for (const row of rows) {
    const name = row.name?.trim()
    if (!name) {
      skipped++
      continue
    }

    const barcode = row.barcode?.trim() || null
    const expiration = cleanDate(row.expiration_date, row.expiry_date)
    const imageUrl = row.image_url?.trim() || null
    const description = row.description?.trim() || null
    const category = row.category?.trim() || null
    const section = row.section?.trim() || null
    const promotionPrice =
      row.promotion_price && String(row.promotion_price).trim() !== ""
        ? sqlNum(row.promotion_price, null)
        : "NULL"

    valueRows.push(
      `(${sqlStr(name)}, ${sqlStr(description)}, ${barcode ? sqlStr(barcode) : "NULL"}, ${sqlNum(row.price)}, ${sqlNum(row.stock_quantity)}, ${sqlNum(row.min_stock_level, "10")}, ${sqlStr(category)}, ${sqlStr(section)}, ${sqlStr(imageUrl)}, ${expiration ? sqlStr(expiration) : "NULL"}, ${sqlNum(row.days_before_expiry_alert, "30")}, ${promotionPrice}, ${sqlBool(row.is_visible)}, ${sqlBool(row.is_active)}, '${placeholder}'::uuid, gen_random_uuid())`,
    )
  }

  const sql = `-- Importación generada automáticamente
-- Productos: ${valueRows.length} | Omitidos sin nombre: ${skipped}
-- Sucursal destino: ${placeholder}
-- Ejecutar en Supabase SQL Editor (BD NUEVA)

BEGIN;

INSERT INTO public.products (
  name,
  description,
  barcode,
  price,
  stock_quantity,
  min_stock_level,
  category,
  section,
  image_url,
  expiration_date,
  days_before_expiry_alert,
  promotion_price,
  is_visible,
  is_active,
  branch_id,
  sku_group_id
) VALUES
${valueRows.join(",\n")}
ON CONFLICT (barcode, branch_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  stock_quantity = EXCLUDED.stock_quantity,
  min_stock_level = EXCLUDED.min_stock_level,
  category = EXCLUDED.category,
  section = EXCLUDED.section,
  image_url = EXCLUDED.image_url,
  expiration_date = EXCLUDED.expiration_date,
  days_before_expiry_alert = EXCLUDED.days_before_expiry_alert,
  promotion_price = EXCLUDED.promotion_price,
  is_visible = EXCLUDED.is_visible,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Agrupar mismo código de barras entre sucursales
DO $$
DECLARE
  rec RECORD;
  new_group_id UUID;
BEGIN
  FOR rec IN
    SELECT barcode
    FROM public.products
    WHERE barcode IS NOT NULL AND TRIM(barcode) <> ''
    GROUP BY barcode
    HAVING COUNT(*) > 1
  LOOP
    new_group_id := gen_random_uuid();
    UPDATE public.products
    SET sku_group_id = new_group_id
    WHERE barcode = rec.barcode;
  END LOOP;

  UPDATE public.products
  SET sku_group_id = id
  WHERE sku_group_id IS NULL;
END $$;

COMMIT;

SELECT b.name AS sucursal, COUNT(*) AS productos
FROM public.products p
JOIN public.branches b ON b.id = p.branch_id
GROUP BY b.name;
`

  const outPath = path.join(__dirname, "generated_import_products.sql")
  fs.writeFileSync(outPath, sql, "utf8")

  console.log(`Listo: ${valueRows.length} productos`)
  console.log(`Archivo: ${outPath}`)
  if (!branchId) {
    console.log("")
    console.log("IMPORTANTE: Reemplaza __PEGAR_UUID_SUCURSAL_AQUI__ en el SQL con el UUID de tu sucursal.")
    console.log("O vuelve a correr con: --branch-id <uuid>")
  }
}

main()
