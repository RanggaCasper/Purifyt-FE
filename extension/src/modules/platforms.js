const PurifytPlatforms = {
  'youtube.com': {
    name: 'YouTube',
    commentSelector:
      'ytd-comment-thread-renderer #content-text, ytd-comment-renderer #content-text',
    containerSelector:
      'ytd-comment-thread-renderer, ytd-comment-renderer'
  },

  /** Detect platform from current hostname */
  detect() {
    const host = location.hostname.replace(/^www\./, '')
    for (const key of Object.keys(this)) {
      if (typeof this[key] === 'object' && host.includes(key)) {
        return { key, ...this[key] }
      }
    }
    return null
  }
}
