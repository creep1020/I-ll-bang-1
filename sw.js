// Firebase Cloud Messaging: keep this worker registered at the app's existing scope.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
    for (const client of windowClients) {
      if ('focus' in client) return client.focus();
    }
    return clients.openWindow('./');
  }));
});
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: 'AIzaSyDT_gTnwBSghvmPQ2s0hcmW9XNqYjV7Pqg',
  authDomain: 'family-61367.firebaseapp.com',
  projectId: 'family-61367',
  storageBucket: 'family-61367.firebasestorage.app',
  messagingSenderId: '706014426399',
  appId: '1:706014426399:web:c3edb6bd45cc690fe32c2a',
  measurementId: 'G-ZLFW1CRS43'
});
firebase.messaging();

const CACHE='ilppang-seq-v1';
const FILES=['./sequential.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ilppang-seq-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>cached)));});
