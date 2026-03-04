document.addEventListener('DOMContentLoaded', async () => {
  // Elements 
  const viewLogin     = document.getElementById('viewLogin')
  const viewDashboard = document.getElementById('viewDashboard')

  // Login
  const loginError    = document.getElementById('loginError')
  const loginUsername = document.getElementById('loginUsername')
  const loginPassword = document.getElementById('loginPassword')
  const btnLogin      = document.getElementById('btnLogin')
  const loginBtnText  = document.getElementById('loginBtnText')
  const loginSpinner  = document.getElementById('loginSpinner')
  const linkRegister  = document.getElementById('linkRegister')

  // Dashboard
  const userAvatar    = document.getElementById('userAvatar')
  const userName      = document.getElementById('userName')
  const userEmail     = document.getElementById('userEmail')
  const btnLogout     = document.getElementById('btnLogout')

  const toggleEnabled  = document.getElementById('toggleEnabled')
  const selectHideMode = document.getElementById('selectHideMode')
  const statusDot      = document.getElementById('statusDot')
  const statusText     = document.getElementById('statusText')
  const scanStatusRow  = document.getElementById('scanStatusRow')
  const scanIndicator  = document.getElementById('scanIndicator')
  const scanStatusText = document.getElementById('scanStatusText')

  const statScanned    = document.getElementById('statScanned')
  const statBlocked    = document.getElementById('statBlocked')
  const btnResetStats  = document.getElementById('btnResetStats')

  const inputApiBase   = document.getElementById('inputApiBase')
  const inputThreshold = document.getElementById('inputThreshold')
  const thresholdValue = document.getElementById('thresholdValue')
  const btnSave        = document.getElementById('btnSave')

  const toast         = document.getElementById('toast')
  const footerVersion = document.getElementById('footerVersion')

  // Inject version from config.js into footer
  if (footerVersion && typeof PurifytConfig !== 'undefined') {
    footerVersion.textContent =
      `Purifyt v${PurifytConfig.VERSION} — dibuat dengan ❤️ untuk internet yang lebih bersih`
  }

  // Helpers 
  function showView(view) {
    viewLogin.classList.toggle('hidden', view !== 'login')
    viewDashboard.classList.toggle('hidden', view !== 'dashboard')
  }

  function showToast(text) {
    toast.textContent = text || '✓ Tersimpan!'
    toast.style.display = 'block'
    setTimeout(() => { toast.style.display = 'none' }, 1800)
  }

  function formatNumber(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
    return String(n)
  }

  function updateStatusUI() {
    const on = toggleEnabled.checked
    statusDot.className = `status-dot ${on ? 'on' : 'off'}`
    statusText.textContent = on ? 'Aktif' : 'Nonaktif'
  }

  function updateScanStatus(status) {
    if (!status || status === 'idle') {
      scanStatusRow.style.display = 'none'
      return
    }
    scanStatusRow.style.display = 'flex'

    const statusMap = {
      scanning: { text: 'Memindai komentar YouTube...', cls: 'scanning' },
      done:     { text: 'Pemindaian selesai', cls: 'done' },
      fallback: { text: 'Mode fallback (DOM)', cls: 'fallback' },
      error:    { text: 'Gagal memindai', cls: 'error' }
    }

    const info = statusMap[status] || { text: status, cls: '' }
    scanIndicator.className = `scan-indicator ${info.cls}`
    scanStatusText.textContent = info.text
  }

  function renderUser(user) {
    if (user) {
      userAvatar.textContent = (user.username || 'P')[0].toUpperCase()
      userName.textContent = user.username || '-'
      userEmail.textContent = user.email || '-'
    }
  }

  // Messaging 
  function sendMsg(msg) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(msg, resolve)
    })
  }

  // Init: check auth state 
  const auth = await sendMsg({ type: 'GET_AUTH' })
  const settings = await sendMsg({ type: 'GET_SETTINGS' })

  if (auth?.accessToken && auth?.user) {
    showView('dashboard')
    renderUser(auth.user)
  } else {
    showView('login')
  }

  // Populate settings
  if (settings) {
    toggleEnabled.checked  = settings.enabled !== false
    selectHideMode.value   = settings.hideMode || 'blur'
    inputApiBase.value     = settings.apiBase || (typeof PurifytConfig !== 'undefined' ? PurifytConfig.API_BASE : 'http://localhost:9000')
    inputThreshold.value   = settings.threshold ?? 0.5
    thresholdValue.textContent = `${Math.round((settings.threshold ?? 0.5) * 100)}%`
    updateScanStatus(settings.scanStatus)
  }
  updateStatusUI()

  // Load stats
  const stats = await sendMsg({ type: 'GET_STATS' })
  if (stats) {
    statScanned.textContent = formatNumber(stats.statsScanned || 0)
    statBlocked.textContent = formatNumber(stats.statsBlocked || 0)
  }

  // REAL-TIME STATS via chrome.storage.onChanged
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return

    if (changes.statsScanned) {
      statScanned.textContent = formatNumber(changes.statsScanned.newValue || 0)
    }
    if (changes.statsBlocked) {
      statBlocked.textContent = formatNumber(changes.statsBlocked.newValue || 0)
    }
    if (changes.scanStatus) {
      updateScanStatus(changes.scanStatus.newValue)
    }
    if (changes.enabled) {
      toggleEnabled.checked = changes.enabled.newValue !== false
      updateStatusUI()
    }
  })

  // LOGIN
  btnLogin.addEventListener('click', async () => {
    const username = loginUsername.value.trim()
    const password = loginPassword.value.trim()

    if (!username || !password) {
      loginError.textContent = 'Username dan password harus diisi'
      loginError.classList.add('show')
      return
    }

    loginError.classList.remove('show')
    loginBtnText.textContent = 'Logging in...'
    loginSpinner.classList.remove('hidden')
    btnLogin.disabled = true

    const result = await sendMsg({ type: 'LOGIN', username, password })

    loginSpinner.classList.add('hidden')
    loginBtnText.textContent = 'Login'
    btnLogin.disabled = false

    if (result?.success) {
      renderUser(result.user)
      showView('dashboard')
      showToast('✓ Login berhasil!')
      // Tell YouTube tabs to rescan
      chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
        for (const tab of tabs) {
          if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'RESCAN' }).catch(() => {})
        }
      })
    } else {
      loginError.textContent = result?.error || 'Login gagal'
      loginError.classList.add('show')
    }
  })

  loginPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnLogin.click()
  })

  linkRegister.addEventListener('click', (e) => {
    e.preventDefault()
    const base = (typeof PurifytConfig !== 'undefined')
      ? PurifytConfig.WEBSITE_URL
      : (settings?.apiBase || 'http://localhost:9000').replace(/:\d+$/, ':3000')
    chrome.tabs.create({ url: `${base}/register` })
  })

  // LOGOUT
  btnLogout.addEventListener('click', async () => {
    await sendMsg({ type: 'LOGOUT' })
    loginUsername.value = ''
    loginPassword.value = ''
    loginError.classList.remove('show')
    showView('login')
    showToast('Anda telah logout')
    chrome.tabs.query({ url: 'https://*.youtube.com/*' }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_SPOILERS' }).catch(() => {})
      }
    })
  })

  // IMMEDIATE TOGGLE (no save needed) — fixes "won't turn off" bug
  toggleEnabled.addEventListener('change', async () => {
    const enabled = toggleEnabled.checked
    updateStatusUI()
    // Immediately send toggle command — no need to click Save
    await sendMsg({ type: 'TOGGLE_ENABLED', enabled })
    showToast(enabled ? '✓ Filter diaktifkan' : '✓ Filter dinonaktifkan')
  })

  // Hide mode change — also immediate
  selectHideMode.addEventListener('change', async () => {
    const hideMode = selectHideMode.value
    await sendMsg({ type: 'SAVE_SETTINGS', payload: { hideMode } })
    showToast(`✓ Mode: ${hideMode === 'blur' ? 'Blur' : 'Sembunyikan'}`)
  })

  inputThreshold.addEventListener('input', () => {
    thresholdValue.textContent = `${Math.round(inputThreshold.value * 100)}%`
  })

  // SAVE SETTINGS (API base, threshold)
  btnSave.addEventListener('click', async () => {
    const payload = {
      apiBase: inputApiBase.value.trim() || (typeof PurifytConfig !== 'undefined' ? PurifytConfig.API_BASE : 'http://localhost:9000'),
      threshold: parseFloat(inputThreshold.value) || 0.5
    }
    await sendMsg({ type: 'SAVE_SETTINGS', payload })
    showToast('✓ Pengaturan tersimpan!')
  })

  // RESET STATS
  btnResetStats.addEventListener('click', async () => {
    await sendMsg({ type: 'RESET_STATS' })
    statScanned.textContent = '0'
    statBlocked.textContent = '0'
    showToast('✓ Statistik direset!')
  })
})
