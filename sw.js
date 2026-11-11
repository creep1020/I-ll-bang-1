

/* 일빵빵 PWA + Firebase Cloud Messaging */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyDT_gTnwBSghvmPQ2s0hcmW9XNqYjV7Pqg",
  authDomain: "family-61367.firebaseapp.com",
  projectId: "family-61367",
  storageBucket: "family-61367.firebasestorage.app",
  messagingSenderId: "706014426399",
  appId: "1:706014426399:web:c3edb6bd45cc690fe32c2a",
  measurementId: "G-ZLFW1CRS43"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || '일빵빵 가족 알림';
  const options = {
    body: payload.notification?.body || '오늘의 영어 학습을 확인해 주세요.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: payload.data?.tag || 'ilbbang-family',
    data: {
      url: payload.fcmOptions?.link ||
        'https://creep1020.github.io/1-book/'
    }
  };
  return self.registration.showNotification(title, options);
});

// v6: 최신 앱 화면 우선 확인
const CACHE = 'ilppang-seq-v6-fcm';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key =>
            key.startsWith('ilppang-seq-') && key !== CACHE
          )
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // HTML은 항상 최신 배포본을 우선 사용
  if (
    request.mode === 'navigate' ||
    (
      new URL(request.url).origin === self.location.origin &&
      request.destination === 'document'
    )
  ) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache =>
              cache.put(request, copy)
            );
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match('./index.html');
        })
    );
    return;
  }

  // 이미지와 아이콘은 캐시 우선
  event.respondWith(
    caches.match(request).then(cached =>
      cached || fetch(request).then(response => {
        if (
          response &&
          response.ok &&
          new URL(request.url).origin === self.location.origin
        ) {
          const copy = response.clone();
          caches.open(CACHE).then(cache =>
            cache.put(request, copy)
          );
        }
        return response;
      })
    )
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const target =
    event.notification.data?.url ||
    'https://creep1020.github.io/1-book/';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
