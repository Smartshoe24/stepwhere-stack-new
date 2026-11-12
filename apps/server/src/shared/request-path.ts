const SHARE_LINK_PATH_PATTERN = /^(\/v1\/share-links\/)[^/]+(\/ws)?$/;

export function redactSensitiveRequestPath(path: string) {
  return path.replace(SHARE_LINK_PATH_PATTERN, "$1[redacted]$2");
}
