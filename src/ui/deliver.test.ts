import { describe, expect, it } from 'vitest'
import { chooseDelivery } from './deliver'

const file = new File([new Uint8Array([37, 80, 68, 70])], 'doc-firmado.pdf', { type: 'application/pdf' })
const share = async () => {}

describe('chooseDelivery', () => {
  it('comparte si el navegador puede compartir el archivo', () => {
    let received: ShareData | undefined
    const nav = { share, canShare: (d?: ShareData) => { received = d; return true } }
    expect(chooseDelivery(nav, file)).toBe('share')
    expect(received?.files).toEqual([file])
  })

  it('descarga si canShare dice que no', () => {
    expect(chooseDelivery({ share, canShare: () => false }, file)).toBe('download')
  })

  it('descarga si no existe canShare o share', () => {
    expect(chooseDelivery({}, file)).toBe('download')
    expect(chooseDelivery({ share }, file)).toBe('download')
    expect(chooseDelivery({ canShare: () => true }, file)).toBe('download')
    expect(chooseDelivery(undefined, file)).toBe('download')
  })

  it('descarga si canShare falla', () => {
    expect(chooseDelivery({ share, canShare: () => { throw new TypeError('no') } }, file)).toBe('download')
  })
})
