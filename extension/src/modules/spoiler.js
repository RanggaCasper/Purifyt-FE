const PurifytSpoiler = (() => {
  /**
   * Apply spoiler or hide to a comment node.
   * @param {Element} node - the #content-text element
   * @param {{ judi: number, label: number }} result
   * @param {'blur'|'hide'} mode
  */
  function apply(node, result, mode = 'blur') {
    if (node.closest('.purifyt-spoiler') || node.closest('.purifyt-hidden')) return

    const pct = (result.judi * 100).toFixed(0)

    if (mode === 'hide') {
      applyHide(node, pct)
    } else {
      applyBlur(node, pct)
    }
  }

  /** Blur mode: wrap content in a blur container with badge */
  function applyBlur(node, pct) {
    const wrapper = document.createElement('span')
    wrapper.className = 'purifyt-spoiler'

    // Badge
    const badge = createBadge(pct, 'blur')
    badge.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      const spoiler = badge.closest('.purifyt-spoiler')
      if (spoiler) spoiler.classList.toggle('purifyt-revealed')
    })
    wrapper.appendChild(badge)

    // Blur wrapper
    const blurWrap = document.createElement('span')
    blurWrap.className = 'purifyt-blur'
    while (node.firstChild) {
      blurWrap.appendChild(node.firstChild)
    }
    wrapper.appendChild(blurWrap)

    node.appendChild(wrapper)
  }

  /** Hide mode: collapse the entire comment thread/renderer */
  function applyHide(node, pct) {
    // Find the closest comment container (thread or single comment)
    const container
      = node.closest('ytd-comment-thread-renderer')
        || node.closest('ytd-comment-renderer')
        || node.parentElement

    if (!container || container.classList.contains('purifyt-hidden')) return

    // Save original display
    container.dataset.purifytOriginalDisplay = container.style.display || ''
    container.classList.add('purifyt-hidden')
    container.style.display = 'none'

    // Insert a small indicator before the hidden container
    const indicator = document.createElement('div')
    indicator.className = 'purifyt-hide-indicator'
    indicator.innerHTML = `
      <img src="${chrome.runtime.getURL('src/icons/logo.png')}" class="purifyt-badge-logo" alt="" />
      <span class="purifyt-hide-text">Komentar judol disembunyikan (${pct}% confidence)</span>
      <button class="purifyt-hide-show-btn">Tampilkan</button>
      <button class="purifyt-hide-dismiss-btn">✕</button>
    `

    const showBtn = indicator.querySelector('.purifyt-hide-show-btn')
    const dismissBtn = indicator.querySelector('.purifyt-hide-dismiss-btn')

    showBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      container.classList.remove('purifyt-hidden')
      container.style.display = container.dataset.purifytOriginalDisplay || ''
      delete container.dataset.purifytOriginalDisplay
      indicator.remove()
    })

    dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      indicator.remove()
    })

    container.parentNode.insertBefore(indicator, container)
  }

  /** Create a badge element */
  function createBadge(pct, mode) {
    const badge = document.createElement('span')
    badge.className = 'purifyt-badge purifyt-badge--judol'
    badge.innerHTML = `<img src="${chrome.runtime.getURL('src/icons/logo.png')}" class="purifyt-badge-logo" alt="" /> Judol ${pct}%`
    badge.title = `Purifyt: Terdeteksi judi online (${pct}% confidence). Klik untuk ${mode === 'blur' ? 'tampilkan/sembunyikan' : 'lihat detail'}.`
    return badge
  }

  /** Remove all spoiler wrappers from the page */
  function removeAll() {
    // Remove blur spoilers
    document.querySelectorAll('.purifyt-spoiler').forEach((wrapper) => {
      const blur = wrapper.querySelector('.purifyt-blur')
      if (blur && wrapper.parentNode) {
        while (blur.firstChild) {
          wrapper.parentNode.insertBefore(blur.firstChild, wrapper)
        }
      }
      wrapper.remove()
    })

    // Remove hide indicators and restore hidden comments
    document.querySelectorAll('.purifyt-hide-indicator').forEach((indicator) => {
      indicator.remove()
    })
    document.querySelectorAll('.purifyt-hidden').forEach((container) => {
      container.classList.remove('purifyt-hidden')
      container.style.display = container.dataset.purifytOriginalDisplay || ''
      delete container.dataset.purifytOriginalDisplay
    })
  }

  return { apply, removeAll }
})()
