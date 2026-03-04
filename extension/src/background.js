importScripts(
  'modules/config.js',
  'modules/storage.js',
  'modules/auth.js',
  'modules/api.js'
)

// Badge helper
function updateBadge(tabId, count) {
  const text = count > 0 ? String(count) : ''
  chrome.action.setBadgeText({ text, tabId }).catch(() => {})
  chrome.action.setBadgeBackgroundColor({ color: '#dc2626', tabId }).catch(() => {})
}

// Per-tab stats for the badge
const tabStats = new Map() // tabId → { scanned, blocked }

function getTabStats(tabId) {
  if (!tabStats.has(tabId)) {
    tabStats.set(tabId, { scanned: 0, blocked: 0 })
  }
  return tabStats.get(tabId)
}

// Auth helper with auto-retry
async function getValidToken() {
  const settings = await PurifytStorage.get()
  const { accessToken } = await PurifytAuth.getAuth()

  if (!accessToken) return { token: null, settings }

  return { token: accessToken, settings }
}

async function retryWithRefresh(fn) {
  const { token, settings } = await getValidToken()
  if (!token) return { error: 'NOT_AUTHENTICATED' }

  try {
    return await fn(token, settings)
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') {
      const refreshResult = await PurifytAuth.refresh(settings.apiBase)
      if (refreshResult.success) {
        try {
          return await fn(refreshResult.accessToken, settings)
        } catch { /* fall through */ }
      }
      return { error: 'NOT_AUTHENTICATED' }
    }
    throw err
  }
}

// Message routing
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = MESSAGE_HANDLERS[msg.type]
  if (handler) {
    handler(msg, sender)
      .then(sendResponse)
      .catch((err) => {
        console.error('[Purifyt BG]', msg.type, err)
        sendResponse({ error: err.message })
      })
    return true // keep channel open for async response
  }
})

const MESSAGE_HANDLERS = {
  // Auth
  async LOGIN(msg) {
    const settings = await PurifytStorage.get()
    const result = await PurifytAuth.login(settings.apiBase, msg.username, msg.password)
    return result
  },

  async LOGOUT() {
    const settings = await PurifytStorage.get()
    await PurifytAuth.logout(settings.apiBase)
    return { ok: true }
  },

  async GET_AUTH() {
    return await PurifytAuth.getAuth()
  },

  async REFRESH_TOKEN() {
    const settings = await PurifytStorage.get()
    return await PurifytAuth.refresh(settings.apiBase)
  },

  // YouTube Video Scan (Primary Flow)
  async SCAN_VIDEO(msg, sender) {
    const videoId = msg.videoId
    if (!videoId) return { error: 'NO_VIDEO_ID' }

    const settings = await PurifytStorage.get()
    if (!settings.enabled) return { error: 'DISABLED', comments: [] }

    await PurifytStorage.set({ lastVideoId: videoId, scanStatus: 'scanning' })

    // Reset per-tab stats for this new scan
    if (sender.tab?.id) {
      tabStats.set(sender.tab.id, { scanned: 0, blocked: 0 })
      updateBadge(sender.tab.id, 0)
    }

    try {
      const result = await retryWithRefresh(async (token, s) => {
        return await PurifytApi.scanVideo(videoId, s.apiBase, token)
      })

      if (result.error) {
        await PurifytStorage.set({ scanStatus: 'error' })
        return result
      }

      const comments = result.comments || []
      const totalComments = result.total_comments ?? comments.length
      const judolComments = comments.filter(
        c => c.predicted_label === 1 && c.confidence_judi >= settings.threshold
      )

      // Update global stats
      await PurifytStorage.incrementStats(totalComments, judolComments.length)

      // Update per-tab badge
      if (sender.tab?.id) {
        const ts = getTabStats(sender.tab.id)
        ts.scanned = totalComments
        ts.blocked = judolComments.length
        updateBadge(sender.tab.id, judolComments.length)
      }

      await PurifytStorage.set({ scanStatus: 'done' })

      return {
        comments,
        totalComments,
        judolCount: result.judi_count ?? judolComments.length,
        threshold: settings.threshold
      }
    } catch (err) {
      console.error('[Purifyt BG] SCAN_VIDEO failed:', err)
      await PurifytStorage.set({ scanStatus: 'error' })
      return { error: err.message, comments: [] }
    }
  },

  // Fallback Classification (DOM mode)
  async CLASSIFY(msg, sender) {
    const settings = await PurifytStorage.get()
    if (!settings.enabled) return { results: [], skipped: true }

    const texts = msg.texts
    if (!texts || texts.length === 0) return { results: [] }

    try {
      const result = await retryWithRefresh(async (token, s) => {
        const results = await PurifytApi.classifyBatch(texts, s.apiBase, token)
        return { results }
      })

      if (result.error) return { error: result.error, results: [] }

      const results = result.results || []
      const blocked = results.filter(
        r => r.label === 1 && r.judi >= settings.threshold
      ).length

      // Update global stats
      await PurifytStorage.incrementStats(texts.length, blocked)

      // Update per-tab badge
      if (sender.tab?.id) {
        const ts = getTabStats(sender.tab.id)
        ts.scanned += texts.length
        ts.blocked += blocked
        updateBadge(sender.tab.id, ts.blocked)
      }

      return { results, threshold: settings.threshold }
    } catch (err) {
      console.error('[Purifyt BG] CLASSIFY error:', err)
      return { error: err.message, results: [] }
    }
  },

  // Real-time stat increment from content script
  async COMMENT_FLAGGED(msg, sender) {
    // Increment blocked count when a judol comment is visually flagged in DOM
    if (sender.tab?.id) {
      const ts = getTabStats(sender.tab.id)
      ts.blocked++
      updateBadge(sender.tab.id, ts.blocked)
    }
    return { ok: true }
  },

  // Scan status updates
  async SCAN_STATUS(msg) {
    await PurifytStorage.set({ scanStatus: msg.status, lastVideoId: msg.videoId || null })
    return { ok: true }
  },

  // Settings
  async GET_SETTINGS() {
    return await PurifytStorage.get()
  },

  async SAVE_SETTINGS(msg) {
    await PurifytStorage.set(msg.payload)
    // Notify all YouTube tabs
    broadcastToYouTubeTabs({ type: 'SETTINGS_UPDATED', payload: msg.payload })
    return { ok: true }
  },

  // Immediate toggle (no save button needed)
  async TOGGLE_ENABLED(msg) {
    const enabled = !!msg.enabled
    await PurifytStorage.set({ enabled })
    // Broadcast to all YouTube tabs immediately
    broadcastToYouTubeTabs({ type: 'TOGGLE_ENABLED', enabled })
    // Also clear badge if disabling
    if (!enabled) {
      chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
        for (const tab of tabs) {
          if (tab.id) updateBadge(tab.id, 0)
        }
      })
      tabStats.clear()
    }
    return { ok: true }
  },

  async GET_STATS() {
    const s = await PurifytStorage.get()
    return { statsScanned: s.statsScanned, statsBlocked: s.statsBlocked }
  },

  async RESET_STATS() {
    await PurifytStorage.resetStats()
    tabStats.clear()
    // Clear all badges
    chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) updateBadge(tab.id, 0)
      }
    })
    return { ok: true }
  }
}

// Broadcast to YouTube tabs
function broadcastToYouTubeTabs(message) {
  chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {})
      }
    }
  })
}

// Tab cleanup
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStats.delete(tabId)
})

// Install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set(PurifytStorage.DEFAULTS)
    console.log('[Purifyt] Extension installed — YouTube Judol Filter v2.0')
  }
})
