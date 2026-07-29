export default defineNuxtPlugin(() => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(error => {
        console.warn('[AtomX Staff PWA]', error)
      })
    }, { once: true })
  }
})
