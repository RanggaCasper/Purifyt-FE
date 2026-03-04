;(function purifytContentScript() {
  'use strict'

  if (window.__PURIFYT_INJECTED__) return
  window.__PURIFYT_INJECTED__ = true

  // Only run on YouTube
  if (!location.hostname.includes('youtube.com')) {
    console.log('[Purifyt] Not YouTube, skipping.')
    return
  }

  console.log('[Purifyt] Active on YouTube')

  // Runtime settings
  const settings = { enabled: true, threshold: 0.5, hideMode: 'blur' }
  let lastUrl = location.href

  // Load initial settings & start
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
    if (chrome.runtime.lastError) return
    if (res) {
      Object.assign(settings, res)
      PurifytScanner.updateSettings(settings)
    }
    if (settings.enabled) {
      boot()
    }
  })

  // Boot: start observer and trigger scan if on a video page
  function boot() {
    PurifytScanner.updateSettings(settings)
    PurifytScanner.startObserver()
    triggerScanIfVideo()
  }

  // Trigger scan if we're on a YouTube video page
  function triggerScanIfVideo() {
    const videoId = PurifytScanner.getVideoId()
    if (videoId && settings.enabled) {
      // Delay slightly to let YouTube render comments section
      setTimeout(() => {
        PurifytScanner.startVideoScan()
      }, 1500)
    }
  }

  // YouTube SPA navigation detection
  // YouTube uses History API for navigation (pushState/replaceState).
  // We listen for yt-navigate-finish (YouTube's custom event) and
  // also poll for URL changes as a fallback.
  document.addEventListener('yt-navigate-finish', () => {
    handleNavigation()
  })

  // Fallback: poll for URL changes (catches edge cases)
  setInterval(() => {
    if (location.href !== lastUrl) {
      handleNavigation()
    }
  }, 1000)

  function handleNavigation() {
    const newUrl = location.href
    if (newUrl === lastUrl) return
    lastUrl = newUrl

    console.log('[Purifyt] Navigation detected:', newUrl)

    // Reset scanner state for new page
    PurifytScanner.reset()
    PurifytSpoiler.removeAll()

    // Trigger scan on new video page
    if (settings.enabled) {
      triggerScanIfVideo()
    }
  }

  // Message listener: settings updates, rescan, clear
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SETTINGS_UPDATED') {
      const wasEnabled = settings.enabled
      Object.assign(settings, msg.payload)
      PurifytScanner.updateSettings(settings)

      if (!settings.enabled && wasEnabled) {
        // Turning OFF: stop everything, clear spoilers
        PurifytScanner.stopObserver()
        PurifytScanner.reset()
        PurifytSpoiler.removeAll()
        console.log('[Purifyt] Disabled — observer stopped, spoilers removed')
      } else if (settings.enabled && !wasEnabled) {
        // Turning ON: restart everything
        console.log('[Purifyt] Enabled — restarting')
        boot()
      } else if (settings.enabled) {
        // Settings changed while active: re-scan with new settings
        PurifytScanner.reset()
        PurifytSpoiler.removeAll()
        triggerScanIfVideo()
      }
    }

    if (msg.type === 'RESCAN') {
      console.log('[Purifyt] Rescan triggered')
      PurifytScanner.reset()
      PurifytSpoiler.removeAll()
      if (settings.enabled) {
        triggerScanIfVideo()
      }
    }

    if (msg.type === 'CLEAR_SPOILERS') {
      PurifytSpoiler.removeAll()
      PurifytScanner.reset()
    }

    if (msg.type === 'TOGGLE_ENABLED') {
      const wasEnabled = settings.enabled
      settings.enabled = msg.enabled
      PurifytScanner.updateSettings(settings)

      if (!settings.enabled && wasEnabled) {
        PurifytScanner.stopObserver()
        PurifytScanner.reset()
        PurifytSpoiler.removeAll()
      } else if (settings.enabled && !wasEnabled) {
        boot()
      }
    }
  })

  console.log('[Purifyt] Content script initialised.')
})()
