import qrcode from 'qrcode-generator'

export function createFamilyJoinQrSvg(input: {
  familyName: string
  phoneNumber: string
  joinUrl: string
}) {
  const qr = qrcode(0, 'M')
  qr.addData(input.joinUrl)
  qr.make()

  const qrSvg = qr.createSvgTag({ cellSize: 5, margin: 0 })
  const qrInner = qrSvg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="440" viewBox="0 0 360 440" fill="none">`,
    `<desc>${escapeXml(input.joinUrl)}</desc>`,
    `<rect width="360" height="440" rx="12" fill="white"/>`,
    `<text x="28" y="42" fill="#111827" font-size="20" font-family="Inter, Arial, sans-serif" font-weight="700">Stepwhere Family</text>`,
    `<text x="28" y="74" fill="#111827" font-size="22" font-family="Inter, Arial, sans-serif" font-weight="700">${escapeXml(input.familyName)}</text>`,
    `<text x="28" y="100" fill="#6B7280" font-size="14" font-family="Inter, Arial, sans-serif">${escapeXml(input.phoneNumber)}</text>`,
    `<g transform="translate(30 120) scale(1.2)">${qrInner}</g>`,
    `</svg>`,
  ].join('')
}

export function downloadFamilyJoinQrSvg(input: {
  familyName: string
  phoneNumber: string
  joinUrl: string
}) {
  const blob = new Blob([createFamilyJoinQrSvg(input)], {
    type: 'image/svg+xml;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `family-join-${sanitizeFilename(input.familyName)}.svg`
  anchor.click()
  URL.revokeObjectURL(url)
}

function sanitizeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
