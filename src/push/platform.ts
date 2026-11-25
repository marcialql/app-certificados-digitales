export type PushState = 'no-soportado' | 'requiere-instalar' | 'pendiente' | 'activo' | 'denegado'

export interface PushEnv {
  userAgent: string
  standalone: boolean
  hasPush: boolean
  permission: NotificationPermission
  hasSubscription: boolean
}

const isIPhone = (ua: string) => /iPhone|iPad|iPod/.test(ua)

export function getPushState(env: PushEnv): PushState {
  // En iPhone los avisos solo funcionan con la app añadida a la pantalla de inicio.
  if (isIPhone(env.userAgent) && !env.standalone) return 'requiere-instalar'
  if (!env.hasPush) return 'no-soportado'
  if (env.permission === 'denied') return 'denegado'
  if (env.permission === 'granted' && env.hasSubscription) return 'activo'
  return 'pendiente'
}

export async function readPushEnv(): Promise<PushEnv> {
  const nav = navigator as Navigator & { standalone?: boolean }
  const standalone =
    nav.standalone === true ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
  const hasPush = 'PushManager' in window && 'serviceWorker' in navigator
  const permission: NotificationPermission =
    typeof Notification === 'undefined' ? 'default' : Notification.permission
  let hasSubscription = false
  if (hasPush && permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker.ready
      hasSubscription = (await reg.pushManager.getSubscription()) !== null
    } catch {
      hasSubscription = false
    }
  }
  return { userAgent: navigator.userAgent, standalone, hasPush, permission, hasSubscription }
}
