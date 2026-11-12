export function getAuthOriginDiagnostics(
  apiBaseUrl: string,
  browserOrigin: string
) {
  const apiUrl = new URL(apiBaseUrl)
  const browserUrl = new URL(browserOrigin)

  const sameHostname = apiUrl.hostname === browserUrl.hostname
  const sameProtocol = apiUrl.protocol === browserUrl.protocol
  const sameSiteForLocalCookie = sameHostname && sameProtocol

  return {
    apiOrigin: apiUrl.origin,
    browserOrigin: browserUrl.origin,
    sameHostname,
    sameProtocol,
    sameSiteForLocalCookie,
    likelyCookieProblem: !sameSiteForLocalCookie,
  }
}
