// Deduce en qué entorno está corriendo el frontend a partir del hostname
// del navegador, para mostrarlo como badge en el pie de versión (TP6).
// Convención de los deploys: qa.<dominio> → QA, prod.<dominio> → PROD.
// Cualquier otra cosa (localhost, IPs, previews) se considera LOCAL.
// Es una función pura para poder testearla sin tocar window.location.
export function entornoDesdeHostname(hostname) {
  if (typeof hostname !== 'string') {
    return 'LOCAL';
  }

  const host = hostname.trim().toLowerCase();
  if (host.startsWith('qa.')) {
    return 'QA';
  }
  if (host.startsWith('prod.')) {
    return 'PROD';
  }
  return 'LOCAL';
}
