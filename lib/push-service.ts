import "server-only";

import webpush from "web-push";
import { activeSubscriptions, disableSubscription, touchSubscription } from "./notification-db";

let configured = false;
function configure() {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@alreem-clinic.com", publicKey, privateKey);
  configured = true;
  return true;
}

export function pushConfiguration() {
  return { configured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY), publicKey: process.env.VAPID_PUBLIC_KEY || null };
}

export async function sendPush(userId: string, clinicId: string, payload: { title:string; body:string; url?:string|null; tag?:string; priority?:string }) {
  if (!configure()) return { sent: 0, skipped: true };
  const subscriptions = await activeSubscriptions(userId, clinicId);
  let sent = 0;
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint:subscription.endpoint, keys:{ p256dh:subscription.p256dh, auth:subscription.auth } }, JSON.stringify({ title:payload.title, body:payload.body, url:payload.url || "/notifications", tag:payload.tag || "alreem-notification", icon:"/icon-192.png", badge:"/badge-96.png", priority:payload.priority || "normal" }), { TTL: 60 * 60 });
      sent += 1;
      await touchSubscription(subscription.id);
    } catch (error) {
      const status = Number((error as {statusCode?:number}).statusCode || 0);
      if (status === 404 || status === 410) await disableSubscription(subscription.id);
      else await touchSubscription(subscription.id, true);
      console.warn("Push delivery failed", { status, subscriptionId: subscription.id });
    }
  }));
  return { sent, skipped: false };
}

export async function sendPushSafely(...args: Parameters<typeof sendPush>) {
  try { return await sendPush(...args); }
  catch (error) { console.warn("Push notification pipeline failed", error instanceof Error ? error.message : "unknown"); return { sent:0, skipped:true }; }
}
