import { sendNotification } from 'web-push'
import { listSubscriptions, removeSubscription } from './subscriptions.ts'

export interface NotifyResult {
  sent: number
  removed: number
}

export async function notifyAll(title: string, body: string): Promise<NotifyResult> {
  const payload = JSON.stringify({ title, body })
  let sent = 0
  let removed = 0
  await Promise.all(
    listSubscriptions().map(async (s) => {
      try {
        await sendNotification(s, payload)
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          removeSubscription(s.endpoint)
          removed++
        }
      }
    }),
  )
  return { sent, removed }
}
