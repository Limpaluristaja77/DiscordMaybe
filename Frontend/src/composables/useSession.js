import { computed, ref } from "vue"

function buildBootstrapQuery(overrides = {}, activeState = {}) {
  const query = new URLSearchParams()
  const guildId = Object.prototype.hasOwnProperty.call(overrides, "guildId")
    ? overrides.guildId
    : activeState.activeGuildId
  const serverChannelId = Object.prototype.hasOwnProperty.call(overrides, "serverChannelId")
    ? overrides.serverChannelId
    : activeState.activeServerChannelId
  const dmThreadId = Object.prototype.hasOwnProperty.call(overrides, "dmThreadId")
    ? overrides.dmThreadId
    : activeState.activeDmThreadId

  if (guildId) {
    query.set("guildId", guildId)
  }

  if (serverChannelId) {
    query.set("serverChannelId", serverChannelId)
  }

  if (dmThreadId) {
    query.set("dmThreadId", dmThreadId)
  }

  return query
}

export function useSession() {
  const token = ref(localStorage.getItem("discordmaybe-token") || "")
  const bootstrap = ref(null)
  const loading = ref(true)
  const contentLoading = ref(false)
  const error = ref("")
  const isAuthenticated = computed(() => Boolean(token.value))

  async function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {})

    if (token.value) {
      headers.set("Authorization", `Bearer ${token.value}`)
    }

    return fetch(url, {
      ...options,
      headers,
    })
  }

  function persistToken(nextToken) {
    token.value = nextToken

    if (nextToken) {
      localStorage.setItem("discordmaybe-token", nextToken)
      return
    }

    localStorage.removeItem("discordmaybe-token")
  }

  function mergeBootstrap(nextBootstrap) {
    if (!nextBootstrap) {
      return
    }

    bootstrap.value = nextBootstrap
  }

  function clearError() {
    error.value = ""
  }

  function setError(message) {
    error.value = message
  }

  function clearSession() {
    persistToken("")
    bootstrap.value = null
  }

  async function fetchBootstrap(activeState, overrides = {}) {
    const query = buildBootstrapQuery(overrides, activeState)
    const response = await apiFetch(`/api/bootstrap${query.size ? `?${query.toString()}` : ""}`)

    if (!response.ok) {
      if (response.status === 401) {
        clearSession()
        return null
      }

      throw new Error(`Failed to fetch data (${response.status})`)
    }

    return response.json()
  }

  async function loadBootstrap(activeState, overrides = {}, { silent = false } = {}) {
    if (!token.value) {
      bootstrap.value = null
      loading.value = false
      contentLoading.value = false
      clearError()
      return
    }

    if (silent) {
      contentLoading.value = true
    } else {
      loading.value = true
    }

    clearError()

    try {
      mergeBootstrap(await fetchBootstrap(activeState, overrides))
    } catch (fetchError) {
      setError(fetchError.message)
    } finally {
      if (silent) {
        contentLoading.value = false
      } else {
        loading.value = false
      }
    }
  }

  return {
    apiFetch,
    bootstrap,
    clearError,
    clearSession,
    contentLoading,
    error,
    fetchBootstrap,
    isAuthenticated,
    loadBootstrap,
    loading,
    mergeBootstrap,
    persistToken,
    setError,
    token,
  }
}
