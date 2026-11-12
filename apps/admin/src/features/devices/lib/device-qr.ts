import JSZip from 'jszip'
import qrcode from 'qrcode-generator'
import { format } from 'date-fns'
import type { AdminDeviceDto } from '@stepwhere/types'

export function getDeviceQrPayload(device: Pick<AdminDeviceDto, 'hardwareIdentifier'>) {
  return device.hardwareIdentifier
}

export function getDeviceQrFilename(
  device: Pick<AdminDeviceDto, 'hardwareIdentifier'>,
  extension: 'svg' | 'png'
) {
  return `${device.hardwareIdentifier}.${extension}`
}

export function createDeviceQrSvg(
  device: Pick<AdminDeviceDto, 'hardwareIdentifier' | 'displayName'>
) {
  const qr = qrcode(0, 'M')
  qr.addData(getDeviceQrPayload(device))
  qr.make()

  const qrSvg = qr.createSvgTag({ cellSize: 5, margin: 0 })
  const qrInner = qrSvg
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="440" viewBox="0 0 360 440" fill="none">`,
    `<desc>${getDeviceQrPayload(device)}</desc>`,
    `<rect width="360" height="440" rx="12" fill="white"/>`,
    `<text x="28" y="42" fill="#111827" font-size="20" font-family="Inter, Arial, sans-serif" font-weight="700">Stepwhere</text>`,
    `<text x="28" y="74" fill="#111827" font-size="22" font-family="Inter, Arial, sans-serif" font-weight="700">${escapeXml(
      device.hardwareIdentifier
    )}</text>`,
    device.displayName
      ? `<text x="28" y="100" fill="#6B7280" font-size="14" font-family="Inter, Arial, sans-serif">${escapeXml(
          device.displayName
        )}</text>`
      : '',
    `<g transform="translate(30 120) scale(1.2)">${qrInner}</g>`,
    `</svg>`,
  ].join('')
}

export function downloadDeviceQrSvg(
  device: Pick<AdminDeviceDto, 'hardwareIdentifier' | 'displayName'>
) {
  downloadTextFile(
    createDeviceQrSvg(device),
    getDeviceQrFilename(device, 'svg'),
    'image/svg+xml;charset=utf-8'
  )
}

export async function downloadDeviceQrPng(
  device: Pick<AdminDeviceDto, 'hardwareIdentifier' | 'displayName'>
) {
  const svg = createDeviceQrSvg(device)
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)

  try {
    const image = await loadImage(svgUrl)
    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = 880

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas 2D context is unavailable.')
    }

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const dataUrl = canvas.toDataURL('image/png')
    const anchor = document.createElement('a')
    anchor.href = dataUrl
    anchor.download = getDeviceQrFilename(device, 'png')
    anchor.click()
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

export async function downloadDeviceQrZip(
  devices: Array<Pick<AdminDeviceDto, 'hardwareIdentifier' | 'displayName'>>
) {
  const zip = new JSZip()

  for (const device of devices) {
    zip.file(getDeviceQrFilename(device, 'svg'), createDeviceQrSvg(device))
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const filename = `stepwhere-device-qrs-${format(
    new Date(),
    'yyyy-MM-dd'
  )}.zip`
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function downloadTextFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load QR SVG.'))
    image.src = src
  })
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
