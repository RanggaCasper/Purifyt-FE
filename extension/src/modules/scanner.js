const PurifytScanner = (() => {
  // State 
  let observer = null
  let scrollHandler = null
  let processedNodes = new WeakSet()
  let isActive = false
  let currentVideoId = null
  let settings = { enabled: true, threshold: 0.5, hideMode: 'blur' }

  // API mode: lookup map for judol comments  (normalizedText → { confidence })
  const judolMap = new Map()

  // Fallback (DOM) mode
  let pendingQueue = []      // { node, text }
  let batchTimer = null
  let usingFallback = false
  const BATCH_DELAY = 800
  const MAX_BATCH = 30

  const COMMENT_SELECTOR =
    'ytd-comment-thread-renderer #content-text, ' +
    'ytd-comment-renderer #content-text'

  // Helpers 
  /** Normalize text for comparison between API results and DOM text */
  function normalize(text) {
    return (text || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
  }

  /** Extract YouTube video ID from current page URL */
  function getVideoId() {
    try {
      const url = new URL(location.href)
      if (url.pathname === '/watch') {
        return url.searchParams.get('v') || null
      }
      // /shorts/VIDEO_ID
      const shortsMatch = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/)
      if (shortsMatch) return shortsMatch[1]
    } catch { /* ignore */ }
    return null
  }

  // API-BASED SCAN (primary)
  /**
   * Start a video scan via the backend API.
   * On success, populates judolMap and immediately scans the DOM.
   * On failure, falls back to DOM-based scanning.
  */
  async function startVideoScan() {
    const videoId = getVideoId()
    if (!videoId) return
    if (!settings.enabled) return

    // Skip if we already scanned this video
    if (videoId === currentVideoId && judolMap.size > 0) {
      applyToVisibleComments()
      return
    }

    currentVideoId = videoId
    judolMap.clear()
    usingFallback = false
    PurifytSpoiler.removeAll()
    processedNodes = new WeakSet()

    // Notify background of scan start
    chrome.runtime.sendMessage({ type: 'SCAN_STATUS', status: 'scanning', videoId })

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SCAN_VIDEO',
        videoId
      })

      if (response?.error) {
        console.warn('[Purifyt] API scan error:', response.error, '→ falling back to DOM scan')
        usingFallback = true
        chrome.runtime.sendMessage({ type: 'SCAN_STATUS', status: 'fallback', videoId })
        applyToVisibleComments() // will use fallback
        return
      }

      // Populate the judol lookup map
      const comments = response?.comments || []
      const threshold = settings.threshold
      let judolCount = 0

      for (const c of comments) {
        if (c.predicted_label === 1 && c.confidence_judi >= threshold) {
          judolMap.set(normalize(c.clean_comment || c.comment), { confidence: c.confidence_judi })
          judolCount++
        }
      }

      console.log(`[Purifyt] Video scan complete: ${comments.length} comments, ${judolCount} judol detected`)

      chrome.runtime.sendMessage({
        type: 'SCAN_STATUS',
        status: 'done',
        videoId,
        totalComments: response?.totalComments ?? comments.length,
        judolCount
      })

      // Apply to currently visible DOM comments
      applyToVisibleComments()

    } catch (err) {
      console.warn('[Purifyt] SCAN_VIDEO failed:', err, '→ falling back to DOM scan')
      usingFallback = true
      chrome.runtime.sendMessage({ type: 'SCAN_STATUS', status: 'fallback', videoId })
      applyToVisibleComments()
    }
  }

  // DOM MATCHING — applies spoiler/hide to visible comment nodes
  function applyToVisibleComments() {
    if (!settings.enabled || !isActive) return

    const nodes = document.querySelectorAll(COMMENT_SELECTOR)

    for (const node of nodes) {
      if (processedNodes.has(node)) continue
      if (node.closest('.purifyt-spoiler') || node.closest('.purifyt-hidden')) continue

      const text = (node.innerText || node.textContent || '').trim()
      if (text.length < 3) continue

      if (usingFallback) {
        // Fallback mode: queue for batch classification
        processedNodes.add(node)
        pendingQueue.push({ node, text })
        scheduleFallbackBatch()
      } else if (judolMap.size > 0) {
        // API mode: look up by normalized text
        processedNodes.add(node)
        const match = judolMap.get(normalize(text))
        if (match) {
          PurifytSpoiler.apply(node, { judi: match.confidence, label: 1 }, settings.hideMode)
          // Notify background for real-time stats
          chrome.runtime.sendMessage({ type: 'COMMENT_FLAGGED' })
        } else {
          // Comment not in API scan results (e.g. filter changed, lazy-loaded)
          // → classify individually via fallback batch
          pendingQueue.push({ node, text })
          scheduleFallbackBatch()
        }
      }
      // If judolMap is empty and not fallback, we're still waiting for API results → skip
    }
  }

  // FALLBACK (DOM) MODE — batch classify via CLASSIFY message
  function scheduleFallbackBatch() {
    if (batchTimer) clearTimeout(batchTimer)
    batchTimer = setTimeout(flushFallbackBatch, BATCH_DELAY)
  }

  async function flushFallbackBatch() {
    batchTimer = null
    if (pendingQueue.length === 0 || !isActive) return

    const batch = pendingQueue.splice(0, MAX_BATCH)
    const texts = batch.map(b => b.text)

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CLASSIFY',
        texts
      })

      if (response?.error || response?.skipped) {
        // Re-queue for retry
        for (const { node } of batch) processedNodes.delete(node)
        console.warn('[Purifyt] Classify error/skipped:', response?.error || 'skipped')
        return
      }

      const results = response?.results || []
      const threshold = response?.threshold ?? settings.threshold

      for (let i = 0; i < batch.length; i++) {
        const { node } = batch[i]
        const result = results[i]
        if (!result) continue

        const isJudol = result.label === 1 && result.judi >= threshold
        if (isJudol) {
          PurifytSpoiler.apply(node, result, settings.hideMode)
        }
      }
    } catch (err) {
      for (const { node } of batch) processedNodes.delete(node)
      console.warn('[Purifyt] Fallback classify error:', err)
    }

    // Continue flushing if more in queue
    if (pendingQueue.length > 0) scheduleFallbackBatch()
  }

  // OBSERVER — watches YouTube DOM for new comment nodes
  let rescanTimer = null

  function startObserver() {
    stopObserver()
    isActive = true

    const doScan = () => {
      if (!isActive || !settings.enabled) return
      applyToVisibleComments()
    }

    observer = new MutationObserver((mutations) => {
      if (!isActive || !settings.enabled) return

      // Detect YouTube comment filter/sort change:
      // When filter changes, YouTube removes many comment thread nodes at once
      let commentThreadsRemoved = 0
      for (const m of mutations) {
        for (const node of m.removedNodes) {
          if (node.nodeType === 1 &&
              (node.tagName === 'YTD-COMMENT-THREAD-RENDERER' ||
               node.tagName === 'YTD-COMMENT-VIEW-MODEL-V2')) {
            commentThreadsRemoved++
          }
        }
      }

      if (commentThreadsRemoved >= 3) {
        // Filter changed — debounce then do a fresh video scan
        if (rescanTimer) clearTimeout(rescanTimer)
        rescanTimer = setTimeout(() => {
          if (!isActive || !settings.enabled) return
          console.log('[Purifyt] Comment filter change detected, rescanning...')
          judolMap.clear()
          processedNodes = new WeakSet()
          pendingQueue = []
          if (batchTimer) { clearTimeout(batchTimer); batchTimer = null }
          startVideoScan()
        }, 800)
        return
      }

      for (const m of mutations) {
        if (m.addedNodes.length > 0) { doScan(); return }
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })

    // Scroll listener for lazy-loaded comments
    let scrollTimer = null
    scrollHandler = () => {
      if (!isActive || !settings.enabled) return
      if (scrollTimer) clearTimeout(scrollTimer)
      scrollTimer = setTimeout(doScan, 300)
    }
    window.addEventListener('scroll', scrollHandler, { passive: true })
  }

  function stopObserver() {
    isActive = false
    if (observer) { observer.disconnect(); observer = null }
    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler)
      scrollHandler = null
    }
    if (batchTimer) { clearTimeout(batchTimer); batchTimer = null }
    if (rescanTimer) { clearTimeout(rescanTimer); rescanTimer = null }
    pendingQueue = []
  }

  // PUBLIC API
  function updateSettings(newSettings) {
    Object.assign(settings, newSettings)
  }

  /** Full reset — new video or disable */
  function reset() {
    currentVideoId = null
    judolMap.clear()
    processedNodes = new WeakSet()
    pendingQueue = []
    usingFallback = false
    if (batchTimer) { clearTimeout(batchTimer); batchTimer = null }
    if (rescanTimer) { clearTimeout(rescanTimer); rescanTimer = null }
  }

  return {
    getVideoId,
    startVideoScan,
    applyToVisibleComments,
    startObserver,
    stopObserver,
    updateSettings,
    reset
  }
})()
