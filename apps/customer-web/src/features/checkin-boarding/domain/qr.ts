import qrcode from 'qrcode-generator'

/** The dark modules of a QR code holding `text`: the smallest version that fits, error correction level M. */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => qr.isDark(row, col)))
}
