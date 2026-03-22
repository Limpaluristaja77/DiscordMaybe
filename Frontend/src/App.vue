<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import Rail from "./components/Rail.vue"
import Sidebar from "./components/Sidebar.vue"
import ChatMain from "./components/ChatMain.vue"
import Members from "./components/Members.vue"
import AuthPanel from "./components/AuthPanel.vue"

const view = ref("server")
const bootstrap = ref(null)
const loading = ref(true)
const error = ref("")
const socket = ref(null)
const token = ref(localStorage.getItem("discordmaybe-token") || "")

const guilds = computed(() => bootstrap.value?.guilds || [])
const serverChannels = computed(() => bootstrap.value?.serverChannels || [])
const dmList = computed(() => bootstrap.value?.dmList || [])
const serverMessages = computed(() => bootstrap.value?.serverMessages || [])
const dmMessages = computed(() => bootstrap.value?.dmMessages || [])
const serverMembers = computed(() => bootstrap.value?.serverMembers || [])
const dmMembers = computed(() => bootstrap.value?.dmMembers || [])
const activeGuildName = computed(() => bootstrap.value?.activeGuildName || "Server")
const dmTitle = computed(() => bootstrap.value?.dmTitle || "Direct Messages")
const activeServerChannelId = computed(() => bootstrap.value?.activeServerChannelId || null)
const activeDmChannelId = computed(() => bootstrap.value?.activeDmChannelId || null)
const currentUser = computed(
  () =>
    bootstrap.value?.currentUser || {
      username: "user",
      tag: "@user",
    }
)
const serverChannelName = computed(
  () => serverChannels.value.find((channel) => channel.active)?.name || "general"
)
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

function clearSession() {
  token.value = ""
  bootstrap.value = null
  localStorage.removeItem("discordmaybe-token")
  socket.value?.disconnect()
  socket.value = null
}

function appendMessage(channelId, message) {
  if (!bootstrap.value || !channelId || message.channelId !== channelId) {
    return
  }

  if (channelId === activeServerChannelId.value) {
    bootstrap.value.serverMessages = [...bootstrap.value.serverMessages, message]
  }

  if (channelId === activeDmChannelId.value) {
    bootstrap.value.dmMessages = [...bootstrap.value.dmMessages, message]
  }
}

async function ensureSocketClient() {
  if (window.io) {
    return window.io
  }

  await new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-socket-io-client="true"]')
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true })
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Socket.IO client")), {
        once: true,
      })
      return
    }

    const script = document.createElement("script")
    script.src = "/socket.io/socket.io.js"
    script.dataset.socketIoClient = "true"
    script.onload = resolve
    script.onerror = () => reject(new Error("Failed to load Socket.IO client"))
    document.head.appendChild(script)
  })

  return window.io
}

async function connectRealtime() {
  if (!token.value) {
    return
  }

  if (socket.value) {
    socket.value.disconnect()
    socket.value = null
  }

  try {
    const ioClient = await ensureSocketClient()
    const nextSocket = ioClient({
      path: "/socket.io",
      auth: {
        token: token.value,
      },
    })

    nextSocket.on("message:new", (message) => {
      appendMessage(message.channelId, message)
    })

    socket.value = nextSocket
  } catch (connectionError) {
    console.error("Failed to initialize realtime connection:", connectionError)
  }
}

async function joinActiveRooms() {
  if (!socket.value) {
    return
  }

  if (activeServerChannelId.value) {
    socket.value.emit("channel:join", activeServerChannelId.value)
  }

  if (activeDmChannelId.value) {
    socket.value.emit("channel:join", activeDmChannelId.value)
  }
}

async function loadBootstrap() {
  if (!token.value) {
    bootstrap.value = null
    loading.value = false
    error.value = ""
    return
  }

  loading.value = true
  error.value = ""

  try {
    const response = await apiFetch("/api/bootstrap")

    if (!response.ok) {
      if (response.status === 401) {
        clearSession()
        loading.value = false
        return
      }

      throw new Error(`Failed to fetch data (${response.status})`)
    }

    bootstrap.value = await response.json()
  } catch (fetchError) {
    error.value = fetchError.message
  } finally {
    loading.value = false
  }
}

async function handleAuthenticate({ mode, payload }) {
  const response = await fetch(`/api/auth/${mode}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || `${mode} failed`)
  }

  token.value = data.token
  localStorage.setItem("discordmaybe-token", data.token)

  await loadBootstrap()
  await connectRealtime()
  await joinActiveRooms()
}

async function handleSendMessage({ view: nextView, content, attachments = [] }) {
  const channelId =
    nextView === "server" ? activeServerChannelId.value : activeDmChannelId.value

  if (!channelId) {
    return
  }

  try {
    const response = await apiFetch("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channelId,
        content,
        attachments,
      }),
    })

    if (!response.ok) {
      if (response.status === 401) {
        clearSession()
        return
      }

      throw new Error(`Failed to send message (${response.status})`)
    }

    const createdMessage = await response.json()

    if (!socket.value?.connected) {
      appendMessage(channelId, createdMessage)
    }

    error.value = ""
  } catch (sendError) {
    error.value = sendError.message
    console.error("Failed to send message:", sendError)
  }
}

watch(activeServerChannelId, (nextId, previousId) => {
  if (!socket.value) {
    return
  }

  if (previousId) {
    socket.value.emit("channel:leave", previousId)
  }

  if (nextId) {
    socket.value.emit("channel:join", nextId)
  }
})

watch(activeDmChannelId, (nextId, previousId) => {
  if (!socket.value) {
    return
  }

  if (previousId) {
    socket.value.emit("channel:leave", previousId)
  }

  if (nextId) {
    socket.value.emit("channel:join", nextId)
  }
})

onMounted(async () => {
  await loadBootstrap()

  if (!token.value) {
    return
  }

  await connectRealtime()
  await joinActiveRooms()
})

onBeforeUnmount(() => {
  socket.value?.disconnect()
})
</script>

<template>
  <div v-if="loading" class="app app--status">Loading data...</div>
  <AuthPanel v-else-if="!isAuthenticated" :authenticate="handleAuthenticate" />
  <div v-else-if="error && !bootstrap" class="app app--status">Failed to load: {{ error }}</div>
  <div v-else class="app">
    <Rail :guilds="guilds" :view="view" @set-view="view = $event" />
    <Sidebar
      :view="view"
      :server-channels="serverChannels"
      :dm-list="dmList"
      :active-guild-name="activeGuildName"
      :current-user="currentUser"
      :server-channel-name="serverChannelName"
      @logout="clearSession"
    />
    <ChatMain
      :send-message="handleSendMessage"
      :view="view"
      :server-messages="serverMessages"
      :dm-messages="dmMessages"
      :server-channel-name="serverChannelName"
      :dm-title="dmTitle"
    />
    <Members :view="view" :server-members="serverMembers" :dm-members="dmMembers" />
  </div>
</template>
