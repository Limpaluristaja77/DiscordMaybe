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
const activeGuildId = computed(() => bootstrap.value?.activeGuildId || null)
const activeGuildName = computed(() => bootstrap.value?.activeGuildName || "Server")
const dmTitle = computed(() => bootstrap.value?.dmTitle || "Direct Messages")
const activeServerChannelId = computed(() => bootstrap.value?.activeServerChannelId || null)
const activeDmChannelId = computed(() => bootstrap.value?.activeDmChannelId || null)
const createServerName = ref("")
const creatingServer = ref(false)
const isCreateServerOpen = ref(false)
const createChannelName = ref("")
const creatingChannel = ref(false)
const isCreateChannelOpen = ref(false)
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

function buildBootstrapQuery(overrides = {}) {
  const query = new URLSearchParams()
  const guildId = Object.prototype.hasOwnProperty.call(overrides, "guildId")
    ? overrides.guildId
    : activeGuildId.value
  const serverChannelId = Object.prototype.hasOwnProperty.call(overrides, "serverChannelId")
    ? overrides.serverChannelId
    : activeServerChannelId.value
  const dmThreadId = Object.prototype.hasOwnProperty.call(overrides, "dmThreadId")
    ? overrides.dmThreadId
    : activeDmThreadId.value

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
    const query = buildBootstrapQuery()
    const response = await apiFetch(`/api/bootstrap${query.size ? `?${query.toString()}` : ""}`)

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

const activeDmThreadId = computed(
  () => dmList.value.find((thread) => thread.active)?.id || null
)

async function handleSelectServerChannel(channelId) {
  if (!channelId || channelId === activeServerChannelId.value) {
    view.value = "server"
    return
  }

  view.value = "server"
  loading.value = true

  try {
    const query = buildBootstrapQuery({ serverChannelId: channelId })
    const response = await apiFetch(`/api/bootstrap?${query.toString()}`)

    if (!response.ok) {
      if (response.status === 401) {
        clearSession()
        return
      }

      throw new Error(`Failed to fetch data (${response.status})`)
    }

    bootstrap.value = await response.json()
    error.value = ""
  } catch (fetchError) {
    error.value = fetchError.message
  } finally {
    loading.value = false
  }
}

async function handleSelectDm(threadId) {
  if (!threadId || threadId === activeDmThreadId.value) {
    view.value = "dm"
    return
  }

  view.value = "dm"
  loading.value = true

  try {
    const query = buildBootstrapQuery({ dmThreadId: threadId })
    const response = await apiFetch(`/api/bootstrap?${query.toString()}`)

    if (!response.ok) {
      if (response.status === 401) {
        clearSession()
        return
      }

      throw new Error(`Failed to fetch data (${response.status})`)
    }

    bootstrap.value = await response.json()
    error.value = ""
  } catch (fetchError) {
    error.value = fetchError.message
  } finally {
    loading.value = false
  }
}

async function handleSelectGuild(guildId) {
  if (!guildId) {
    return
  }

  view.value = "server"

  if (guildId === activeGuildId.value) {
    return
  }

  loading.value = true
  error.value = ""

  try {
    const query = buildBootstrapQuery({
      guildId,
      serverChannelId: null,
      dmThreadId: null,
    })
    const response = await apiFetch(`/api/bootstrap?${query.toString()}`)

    if (!response.ok) {
      if (response.status === 401) {
        clearSession()
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

function openCreateServer() {
  createServerName.value = ""
  error.value = ""
  isCreateServerOpen.value = true
}

function closeCreateServer() {
  if (creatingServer.value) {
    return
  }

  isCreateServerOpen.value = false
}

function openCreateChannel() {
  if (view.value !== "server" || !activeGuildId.value) {
    return
  }

  createChannelName.value = ""
  error.value = ""
  isCreateChannelOpen.value = true
}

function closeCreateChannel() {
  if (creatingChannel.value) {
    return
  }

  isCreateChannelOpen.value = false
}

async function handleCreateServer() {
  const name = createServerName.value.trim()

  if (!name) {
    error.value = "Enter a server name."
    return
  }

  creatingServer.value = true
  error.value = ""

  try {
    const response = await apiFetch("/api/guilds", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    })
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || `Failed to create server (${response.status})`)
    }

    const query = buildBootstrapQuery({
      guildId: data.activeGuildId,
      serverChannelId: data.activeServerChannelId,
      dmThreadId: null,
    })
    const bootstrapResponse = await apiFetch(`/api/bootstrap?${query.toString()}`)

    if (!bootstrapResponse.ok) {
      throw new Error(`Failed to fetch data (${bootstrapResponse.status})`)
    }

    bootstrap.value = await bootstrapResponse.json()
    view.value = "server"
    isCreateServerOpen.value = false
    createServerName.value = ""
  } catch (creationError) {
    error.value = creationError.message
  } finally {
    creatingServer.value = false
  }
}

async function handleCreateChannel() {
  const name = createChannelName.value.trim()

  if (!activeGuildId.value) {
    error.value = "Select a server first."
    return
  }

  if (!name) {
    error.value = "Enter a channel name."
    return
  }

  creatingChannel.value = true
  error.value = ""

  try {
    const response = await apiFetch(`/api/guilds/${activeGuildId.value}/channels`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    })
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || `Failed to create channel (${response.status})`)
    }

    const query = buildBootstrapQuery({
      guildId: activeGuildId.value,
      serverChannelId: data.channel.id,
    })
    const bootstrapResponse = await apiFetch(`/api/bootstrap?${query.toString()}`)

    if (!bootstrapResponse.ok) {
      throw new Error(`Failed to fetch data (${bootstrapResponse.status})`)
    }

    bootstrap.value = await bootstrapResponse.json()
    view.value = "server"
    isCreateChannelOpen.value = false
    createChannelName.value = ""
  } catch (creationError) {
    error.value = creationError.message
  } finally {
    creatingChannel.value = false
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
    <Rail
      :guilds="guilds"
      :view="view"
      :active-guild-id="activeGuildId"
      @set-view="view = $event"
      @select-guild="handleSelectGuild"
      @create-server="openCreateServer"
    />
    <Sidebar
      :view="view"
      :server-channels="serverChannels"
      :dm-list="dmList"
      :active-guild-name="activeGuildName"
      :current-user="currentUser"
      :server-channel-name="serverChannelName"
      @logout="clearSession"
      @open-create-channel="openCreateChannel"
      @select-server-channel="handleSelectServerChannel"
      @select-dm="handleSelectDm"
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
    <div v-if="isCreateServerOpen" class="modal-shell" @click.self="closeCreateServer">
      <div class="modal-card">
        <div class="modal-card__header">
          <div>
            <div class="modal-card__eyebrow">Create</div>
            <h2 class="modal-card__title">New Server</h2>
          </div>
          <button class="icon-btn" title="Close" @click="closeCreateServer">&#10005;</button>
        </div>
        <p class="modal-card__copy">Pick a name and we'll set up starter channels for you.</p>
        <input
          v-model="createServerName"
          class="auth-input"
          type="text"
          maxlength="40"
          placeholder="Server name"
          @keydown.enter.prevent="handleCreateServer"
        />
        <div class="modal-card__actions">
          <button class="auth-toggle__btn" :disabled="creatingServer" @click="closeCreateServer">
            Cancel
          </button>
          <button class="auth-submit" :disabled="creatingServer" @click="handleCreateServer">
            {{ creatingServer ? "Creating..." : "Create Server" }}
          </button>
        </div>
      </div>
    </div>
    <div v-if="isCreateChannelOpen" class="modal-shell" @click.self="closeCreateChannel">
      <div class="modal-card">
        <div class="modal-card__header">
          <div>
            <div class="modal-card__eyebrow">Create</div>
            <h2 class="modal-card__title">New Channel</h2>
          </div>
          <button class="icon-btn" title="Close" @click="closeCreateChannel">&#10005;</button>
        </div>
        <p class="modal-card__copy">Add a text channel to {{ activeGuildName }}.</p>
        <input
          v-model="createChannelName"
          class="auth-input"
          type="text"
          maxlength="40"
          placeholder="channel-name"
          @keydown.enter.prevent="handleCreateChannel"
        />
        <div class="modal-card__actions">
          <button class="auth-toggle__btn" :disabled="creatingChannel" @click="closeCreateChannel">
            Cancel
          </button>
          <button class="auth-submit" :disabled="creatingChannel" @click="handleCreateChannel">
            {{ creatingChannel ? "Creating..." : "Create Channel" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
