const PurifytApi = (() => {
  /**
   * Scan a YouTube video: fetch comments via YouTube API + classify them.
   * Calls POST /api/v1/extension/scan-video
   * @param {string} videoId - YouTube video ID
   * @param {string} apiBase
   * @param {string|null} accessToken
   * @returns {Promise<{video_id: string, total_comments: number, comments: Array}>}
  */
  async function scanVideo(videoId, apiBase, accessToken) {
    const headers = { 'Content-Type': 'application/json' }
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const res = await fetch(`${apiBase}/api/v1/youtube/scan`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ video_id: videoId })
    })

    if (res.status === 401) throw new Error('UNAUTHORIZED')
    if (!res.ok) throw new Error(`API_ERROR_${res.status}`)

    const json = await res.json()
    if (json.status && json.data) return json.data
    throw new Error(json.message || 'Unexpected API response')
  }

  /**
   * Classify a batch of comment texts (fallback mode).
   * @param {string[]} texts
   * @param {string} apiBase
   * @param {string|null} accessToken
   * @returns {Promise<Array>}
  */
  async function classifyBatch(texts, apiBase, accessToken) {
    const headers = { 'Content-Type': 'application/json' }
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const res = await fetch(`${apiBase}/api/v1/labeling/predict/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ texts })
    })

    if (res.status === 401) throw new Error('UNAUTHORIZED')
    if (!res.ok) throw new Error(`API_ERROR_${res.status}`)

    const json = await res.json()
    if (json.status && Array.isArray(json.data)) return json.data
    throw new Error(json.message || 'Unexpected API response')
  }

  return { scanVideo, classifyBatch }
})()
