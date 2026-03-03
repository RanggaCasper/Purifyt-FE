import type { ApiResponse, TokenResponse, User, LoginPayload, RegisterPayload } from '~/types/auth'

const accessToken = ref<string | null>(null)
const user = ref<User | null>(null)
const loading = ref(false)
const authReady = ref(false)

let refreshTimer: ReturnType<typeof setTimeout> | null = null

export const useAuth = () => {
  const config = useRuntimeConfig()
  const API = config.public.apiBase as string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authFetch = <T = unknown>(url: string, opts: Record<string, any> = {}) => {
    return $fetch<ApiResponse<T>>(`${API}${url}`, {
      ...opts,
      credentials: 'include',
      headers: {
        ...(opts.headers || {}),
        ...(accessToken.value
          ? { Authorization: `Bearer ${accessToken.value}` }
          : {})
      }
    })
  }

  const scheduleRefresh = (expiresIn: number) => {
    if (refreshTimer) clearTimeout(refreshTimer)
    const ms = Math.max((expiresIn - 60) * 1000, 5000)
    refreshTimer = setTimeout(() => {
      refresh().catch(() => logout())
    }, ms)
  }

  const setTokens = (data: TokenResponse) => {
    accessToken.value = data.access_token
    if (data.expires_in) {
      scheduleRefresh(data.expires_in)
    }
  }

  const login = async (payload: LoginPayload): Promise<void> => {
    loading.value = true
    try {
      const res = await authFetch<TokenResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: { username: payload.username, password: payload.password }
      })

      if (!res.status || !res.data) {
        const { $i18n } = useNuxtApp()
        throw new Error(res.message || $i18n.t('auth.loginFailed'))
      }

      setTokens(res.data)
      await fetchUser()
    } catch (err: unknown) {
      const e = err as { data?: ApiResponse, status?: number, statusCode?: number, message?: string }
      const body = e?.data as ApiResponse | undefined
      const { $i18n } = useNuxtApp()
      const isNetworkError = !body && !e?.status && !e?.statusCode
      const msg = body?.message || (isNetworkError ? $i18n.t('auth.networkError') : (e?.message || $i18n.t('auth.loginFailed')))
      throw new Error(msg)
    } finally {
      loading.value = false
    }
  }

  const register = async (payload: RegisterPayload): Promise<void> => {
    loading.value = true
    try {
      const res = await authFetch<User>('/api/v1/auth/register', {
        method: 'POST',
        body: payload
      })

      if (!res.status) {
        const { $i18n } = useNuxtApp()
        throw new Error(res.message || $i18n.t('auth.registrationFailed'))
      }
    } catch (err: unknown) {
      const e = err as { data?: ApiResponse, status?: number, statusCode?: number, message?: string }
      const body = e?.data as ApiResponse | undefined
      const { $i18n } = useNuxtApp()
      const isNetworkError = !body && !e?.status && !e?.statusCode
      const msg = body?.message || (isNetworkError ? $i18n.t('auth.networkError') : (e?.message || $i18n.t('auth.registrationFailed')))
      throw new Error(msg)
    } finally {
      loading.value = false
    }
  }

  const refresh = async (): Promise<boolean> => {
    try {
      const res = await authFetch<TokenResponse>('/api/v1/auth/refresh', {
        method: 'POST'
      })

      if (!res.status || !res.data) return false

      setTokens(res.data)
      return true
    } catch {
      accessToken.value = null
      user.value = null
      return false
    }
  }

  const logout = async (): Promise<void> => {
    try {
      await authFetch('/api/v1/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    } finally {
      accessToken.value = null
      user.value = null
      if (refreshTimer) {
        clearTimeout(refreshTimer)
        refreshTimer = null
      }
      await navigateTo('/login')
    }
  }

  const fetchUser = async (): Promise<void> => {
    if (!accessToken.value) return
    try {
      const res = await authFetch<User>('/api/v1/auth/me')
      if (res.status && res.data) {
        user.value = res.data
      }
    } catch {
      user.value = null
    }
  }

  const init = async (): Promise<void> => {
    try {
      const ok = await refresh()
      if (ok) await fetchUser()
    } finally {
      authReady.value = true
    }
  }

  const isAuthenticated = computed(() => !!accessToken.value && !!user.value)

  return {
    accessToken: readonly(accessToken),
    user: readonly(user),
    loading: readonly(loading),
    authReady: readonly(authReady),
    isAuthenticated,
    login,
    register,
    refresh,
    logout,
    fetchUser,
    init
  }
}
