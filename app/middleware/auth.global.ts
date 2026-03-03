/**
 * Global auth guard.
 *
 * Public routes (/login, /register) are always accessible.
 * All other routes require authentication. When no in-memory
 * token exists the plugin (auth.client.ts) will already have
 * attempted a silent refresh; if that failed the user is simply
 * not authenticated and gets redirected to /login.
 */
export default defineNuxtRouteMiddleware((to) => {
  // SSR: skip — token lives in client memory only
  if (import.meta.server) return

  const { isAuthenticated } = useAuth()

  const publicPages = ['/login', '/register', '/']
  const isPublic = publicPages.includes(to.path)

  // Protected route without auth → redirect
  if (!isPublic && !isAuthenticated.value) {
    return navigateTo('/login')
  }
})
