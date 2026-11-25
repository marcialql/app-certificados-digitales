import { describe, expect, it } from 'vitest'
import { chooseClickAction, parsePushPayload } from './swHandlers'

describe('parsePushPayload', () => {
  it('lee el JSON {title, body} que envía el servidor', () => {
    const payload = JSON.stringify({ title: 'Aviso', body: 'Hay novedades' })
    expect(parsePushPayload(payload)).toEqual({ title: 'Aviso', body: 'Hay novedades' })
  })

  it('usa un título por defecto si falta o está vacío', () => {
    expect(parsePushPayload(JSON.stringify({ body: 'Hola' }))).toEqual({ title: 'Certificado Digital', body: 'Hola' })
    expect(parsePushPayload(JSON.stringify({ title: '  ', body: 'Hola' }))).toEqual({ title: 'Certificado Digital', body: 'Hola' })
  })

  it('sin datos devuelve un aviso genérico', () => {
    expect(parsePushPayload(undefined)).toEqual({ title: 'Certificado Digital', body: '' })
    expect(parsePushPayload('')).toEqual({ title: 'Certificado Digital', body: '' })
  })

  it('texto que no es JSON se muestra como cuerpo', () => {
    expect(parsePushPayload('Mensaje simple')).toEqual({ title: 'Certificado Digital', body: 'Mensaje simple' })
  })

  it('ignora campos que no son texto', () => {
    expect(parsePushPayload(JSON.stringify({ title: 5, body: { a: 1 } }))).toEqual({ title: 'Certificado Digital', body: '' })
  })
})

describe('chooseClickAction', () => {
  const origin = 'https://certificados.example.es'

  it('enfoca la ventana abierta de la app', () => {
    expect(chooseClickAction(['https://otra.example/', `${origin}/`], origin)).toEqual({ kind: 'focus', index: 1 })
  })

  it('abre la app en "/" si no hay ninguna ventana suya', () => {
    expect(chooseClickAction([], origin)).toEqual({ kind: 'open', url: '/' })
    expect(chooseClickAction(['https://otra.example/'], origin)).toEqual({ kind: 'open', url: '/' })
  })
})
