export type BuyListBranchQty = {
  branch_id: string
  branch_name: string
  quantity: number
}

export type BuyListItem = {
  product_name: string
  barcode?: string | null
  photo_url?: string | null
  total: number
  branches: BuyListBranchQty[]
}

export type SupplyRequestDocumentInput = {
  title: string
  subtitle?: string
  generatedAt?: string
  items: BuyListItem[]
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function buildSupplyRequestDocumentHtml(input: SupplyRequestDocumentInput) {
  const generatedAt =
    input.generatedAt ||
    new Date().toLocaleString("es-MX", {
      dateStyle: "full",
      timeStyle: "short",
    })

  const rows = input.items
    .map((item) => {
      const photo = item.photo_url
        ? `<img src="${escapeHtml(item.photo_url)}" alt="${escapeHtml(item.product_name)}" />`
        : `<div class="no-photo">Sin foto</div>`
      const branches = item.branches
        .map(
          (branch) => `
            <div class="branch">
              <span>${escapeHtml(branch.branch_name)}</span>
              <strong>${branch.quantity}</strong>
            </div>`,
        )
        .join("")

      return `
        <article class="item">
          <div class="photo">${photo}</div>
          <div class="info">
            <h2>${escapeHtml(item.product_name)}</h2>
            ${item.barcode ? `<p class="barcode">Código: ${escapeHtml(item.barcode)}</p>` : ""}
            <div class="branches">${branches}</div>
          </div>
          <div class="qty">
            <span>Comprar</span>
            <strong>${item.total}</strong>
          </div>
        </article>`
    })
    .join("")

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #1f2937;
      background: #fff;
    }
    .page { padding: 28px; max-width: 900px; margin: 0 auto; }
    h1 { margin: 0 0 6px; font-size: 28px; color: #9f1239; }
    .meta { margin: 0 0 24px; color: #6b7280; font-size: 15px; }
    .item {
      display: grid;
      grid-template-columns: 110px 1fr 110px;
      gap: 16px;
      align-items: center;
      border: 2px solid #fecdd3;
      border-radius: 18px;
      padding: 14px;
      margin-bottom: 14px;
      page-break-inside: avoid;
    }
    .photo img, .no-photo {
      width: 110px;
      height: 110px;
      object-fit: cover;
      border-radius: 14px;
      background: #f3f4f6;
    }
    .no-photo {
      display: flex;
      align-items: center;
      justify-content: center;
      color: #9ca3af;
      font-size: 13px;
      text-align: center;
      padding: 8px;
    }
    .info h2 { margin: 0 0 6px; font-size: 22px; line-height: 1.2; }
    .barcode { margin: 0 0 10px; color: #6b7280; font-size: 13px; }
    .branches { display: flex; flex-wrap: wrap; gap: 8px; }
    .branch {
      background: #fff1f2;
      border: 1px solid #fecdd3;
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 14px;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .qty {
      text-align: center;
      background: #9f1239;
      color: white;
      border-radius: 16px;
      padding: 12px 8px;
    }
    .qty span { display: block; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; }
    .qty strong { display: block; font-size: 34px; line-height: 1.1; }
    .empty { font-size: 20px; padding: 40px 0; text-align: center; }
    @media print {
      .page { padding: 12px; }
      .item { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <h1>${escapeHtml(input.title)}</h1>
    <p class="meta">${escapeHtml(input.subtitle || "")}${input.subtitle ? " · " : ""}${escapeHtml(generatedAt)}</p>
    ${rows || '<p class="empty">No hay productos en esta lista.</p>'}
  </div>
</body>
</html>`
}

export function openSupplyRequestDocument(html: string) {
  const win = window.open("", "_blank")
  if (!win) return false
  win.document.write(html)
  win.document.close()
  let printed = false
  const printWhenReady = () => {
    if (printed) return
    printed = true
    win.focus()
    win.print()
  }
  const images = Array.from(win.document.images)
  if (images.length === 0) {
    setTimeout(printWhenReady, 250)
    return true
  }
  let remaining = images.length
  images.forEach((img) => {
    const done = () => {
      remaining -= 1
      if (remaining <= 0) printWhenReady()
    }
    if (img.complete) done()
    else {
      img.onload = done
      img.onerror = done
    }
  })
  setTimeout(printWhenReady, 2500)
  return true
}

export function downloadSupplyRequestDocument(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function normalizeProductKey(name: string, barcode?: string | null) {
  const code = (barcode || "").trim()
  if (code) return `code:${code.toLowerCase()}`
  return `name:${name.trim().toLowerCase().replace(/\s+/g, " ")}`
}
