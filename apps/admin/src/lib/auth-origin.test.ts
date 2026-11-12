import { describe, expect, it } from 'vitest'
import { getAuthOriginDiagnostics } from './auth-origin'

describe('getAuthOriginDiagnostics', () => {
  it('treats localhost http origins as cookie-compatible across ports', () => {
    expect(
      getAuthOriginDiagnostics('http://localhost:8223', 'http://localhost:5173')
    ).toMatchObject({
      apiOrigin: 'http://localhost:8223',
      browserOrigin: 'http://localhost:5173',
      sameHostname: true,
      sameProtocol: true,
      sameSiteForLocalCookie: true,
      likelyCookieProblem: false,
    })
  })

  it('flags localhost vs 127.0.0.1 as incompatible for local cookie sharing', () => {
    expect(
      getAuthOriginDiagnostics('http://localhost:8223', 'http://127.0.0.1:5173')
    ).toMatchObject({
      sameHostname: false,
      sameProtocol: true,
      sameSiteForLocalCookie: false,
      likelyCookieProblem: true,
    })
  })

  it('flags localhost to ngrok as a likely cookie problem', () => {
    expect(
      getAuthOriginDiagnostics(
        'https://upscale-retread-reforest.ngrok-free.dev',
        'http://localhost:5173'
      )
    ).toMatchObject({
      sameHostname: false,
      sameProtocol: false,
      sameSiteForLocalCookie: false,
      likelyCookieProblem: true,
    })
  })

  it('flags sibling secure subdomains until explicit cross-site support exists', () => {
    expect(
      getAuthOriginDiagnostics(
        'https://api.example.com',
        'https://admin.example.com'
      )
    ).toMatchObject({
      sameHostname: false,
      sameProtocol: true,
      sameSiteForLocalCookie: false,
      likelyCookieProblem: true,
    })
  })
})
