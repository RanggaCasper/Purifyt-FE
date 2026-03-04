const PurifytAuth = (() => {
  const TOKEN_KEY = 'purifyt_access_token'
  const USER_KEY = 'purifyt_user'

  /** Get stored auth state */
  async function getAuth() {
    const data = await chrome.storage.local.get([TOKEN_KEY, USER_KEY])
    return {
      accessToken: data[TOKEN_KEY] || null,
      user: data[USER_KEY] || null
    }
  }

  /** Save auth state */
  async function saveAuth(accessToken, user) {
    await chrome.storage.local.set({
      [TOKEN_KEY]: accessToken,
      [USER_KEY]: user
    })
  }

  /** Clear auth state */
  async function clearAuth() {
    await chrome.storage.local.remove([TOKEN_KEY, USER_KEY])
  }

  /** Login to Purifyt API, returns { success, error?, user? } */
  async function login(apiBase, username, password) {
    try {
      const res = await fetch(`${apiBase}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      const json = await res.json()

      if (!json.status || !json.data) {
        return { success: false, error: json.message || 'Login gagal' }
      }

      const { access_token } = json.data

      // Fetch user info
      const meRes = await fetch(`${apiBase}/api/v1/auth/me`, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      })
      const meJson = await meRes.json()
      const user = meJson.status && meJson.data ? meJson.data : null

      await saveAuth(access_token, user)

      return { success: true, user, accessToken: access_token }
    } catch (err) {
      return { success: false, error: 'Tidak dapat terhubung ke server' }
    }
  }

  /** Logout */
  async function logout(apiBase) {
    const { accessToken } = await getAuth()
    try {
      if (accessToken) {
        await fetch(`${apiBase}/api/v1/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        })
      }
    } catch { /* ignore */ }
    await clearAuth()
  }

  /** Refresh access token via HttpOnly cookie */
  async function refresh(apiBase) {
    try {
      const res = await fetch(`${apiBase}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const json = await res.json()

      if (json.status && json.data) {
        const { accessToken: oldToken } = await getAuth()
        const oldUser = (await chrome.storage.local.get(USER_KEY))[USER_KEY]
        await saveAuth(json.data.access_token, oldUser)
        return { success: true, accessToken: json.data.access_token }
      }
      return { success: false }
    } catch {
      return { success: false }
    }
  }

  return { getAuth, saveAuth, clearAuth, login, logout, refresh }
})()
