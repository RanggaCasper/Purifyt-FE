const PurifytStorage = (() => {
  const DEFAULTS = {
    // API_BASE dari config.js dipakai sebagai default; bisa diubah user lewat popup
    apiBase: (typeof PurifytConfig !== 'undefined') ? PurifytConfig.API_BASE : 'http://localhost:9000',
    enabled: true,
    threshold: 0.5,
    hideMode: 'blur',        // 'blur' | 'hide'
    statsBlocked: 0,
    statsScanned: 0,
    lastVideoId: null,
    scanStatus: 'idle'       // 'idle' | 'scanning' | 'done' | 'error'
  }

  async function get() {
    const result = await chrome.storage.local.get(DEFAULTS)
    return { ...DEFAULTS, ...result }
  }

  async function set(partial) {
    await chrome.storage.local.set(partial)
  }

  async function resetStats() {
    await set({ statsBlocked: 0, statsScanned: 0 })
  }

  /** Increment stats atomically */
  async function incrementStats(scanned, blocked) {
    const current = await get()
    await set({
      statsScanned: current.statsScanned + scanned,
      statsBlocked: current.statsBlocked + blocked
    })
  }

  return { DEFAULTS, get, set, resetStats, incrementStats }
})()
