import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'

// appcheck.json ({"siteKey": "..."}) puede no existir todavía: glob devuelve {} y no rompe el build.
const archivos = import.meta.glob('./appcheck.json', { eager: true, import: 'default' })
const SITE_KEY = archivos['./appcheck.json']?.siteKey || ''

/** Debe llamarse justo después de initializeApp y antes de cualquier llamada a Firebase. */
export function iniciarAppCheck(app) {
  if (typeof window === 'undefined') return null
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true
  }
  if (!SITE_KEY) {
    console.warn('App Check sin siteKey: crea src/appcheck.json con {"siteKey": "..."}')
    return null
  }
  return initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  })
}
