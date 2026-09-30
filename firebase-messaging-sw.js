'use strict';

// Handles standard Web Push/FCM data payloads without exposing chat content.
// Keep this file at the site root and retain the site's existing Firebase config.
const ALERT_TAG = 'snake-bonus-alert';
const META_CACHE = 'snake-secret-alert-meta-v1';
const META_URL = new URL('__snake_alert_ids__', self.registration.scope).href;
let notificationQueue = Promise.resolve();
let recentAlertIds = [];

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function enqueueNotification(task) {
  notificationQueue = notificationQueue.catch(() => {}).then(task);
  return notificationQueue;
}

function readAlert(payload = {}) {
  const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  return {
    type:'SNAKE_SECRET_PUSH',
    messageId:String(data.messageId || data.message_id || payload.fcmMessageId || payload.messageId || ('push_' + Date.now() + '_' + Math.random().toString(16).slice(2,8))),
    userId:String(data.targetUserId || data.userId || data.receiverId || '')
  };
}

async function alreadyHandled(alert) {
  const key = alert.userId + ':' + alert.messageId;
  let cache = null;
  try {
    cache = await caches.open(META_CACHE);
    const stored = await cache.match(META_URL);
    if (stored) {
      const values = await stored.json();
      if (Array.isArray(values)) recentAlertIds = [...new Set([...values, ...recentAlertIds])].slice(-100);
    }
  } catch(e) {}
  if (recentAlertIds.includes(key)) return true;
  recentAlertIds.push(key);
  recentAlertIds = recentAlertIds.slice(-100);
  if (cache) {
    try { await cache.put(META_URL, new Response(JSON.stringify(recentAlertIds), { headers:{'Content-Type':'application/json'} })); } catch(e) {}
  }
  return false;
}

async function showSnakeAlert(alert, windows = null) {
  if (await alreadyHandled(alert)) return;
  const clients = windows || await self.clients.matchAll({ type:'window', includeUncontrolled:true });
  clients.forEach(client => client.postMessage(alert));
  // Foreground Snake gets its animated card; foreground chat remains silent.
  if (clients.some(client => client.visibilityState === 'visible')) return;
  const pending = await self.registration.getNotifications({ tag:ALERT_TAG });
  if (pending.some(notification => notification.data && notification.data.messageId === alert.messageId)) return;
  const latestClients = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
  if (latestClients.some(client => client.visibilityState === 'visible')) return;
  await self.registration.showNotification('Snake 🐍', {
    body:'Bonus alert • Keep playing',
    icon:new URL('snake-alert-icon.png', self.registration.scope).href,
    badge:new URL('snake-alert-badge.png', self.registration.scope).href,
    tag:ALERT_TAG, renotify:true, vibrate:[45,35,65],
    data:{ type:'snake-bonus', messageId:alert.messageId, userId:alert.userId }
  });
}

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch(e) {}
  // Incoming titles/body/contact details are intentionally never used here.
  event.waitUntil(enqueueNotification(() => showSnakeAlert(readAlert(payload))));
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'SNAKE_CLEAR_ALERT') {
    event.waitUntil(enqueueNotification(async () => {
      const pending = await self.registration.getNotifications({ tag:ALERT_TAG });
      pending.forEach(notification => {
        if (!data.userId || !notification.data || !notification.data.userId || notification.data.userId === data.userId) notification.close();
      });
    }));
  }
});

// Tapping the decoy notification only dismisses it. Never open/focus the app or chat.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(Promise.resolve());
});
