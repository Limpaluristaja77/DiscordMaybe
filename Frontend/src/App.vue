<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import Rail from "./components/Rail.vue"
import Sidebar from "./components/Sidebar.vue"
import ChatMain from "./components/ChatMain.vue"
import Members from "./components/Members.vue"
import AuthPanel from "./components/AuthPanel.vue"

const RTC_CONFIGURATION = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
}

const view = ref("server")
const dmSection = ref("friends")
const bootstrap = ref(null)
const loading = ref(true)
const error = ref("")
const socket = ref(null)
const token = ref(localStorage.getItem("discordmaybe-token") || "")
const callStatus = ref("idle")
const callThreadId = ref(null)
const callRole = ref(null)
const callMuted = ref(false)
const incomingCall = ref(null)
const callError = ref("")

const guilds = computed(() => bootstrap.value?.guilds || [])
const serverChannels = computed(() => bootstrap.value?.serverChannels || [])
const dmList = computed(() => bootstrap.value?.dmList || [])
const serverMessages = computed(() => bootstrap.value?.serverMessages || [])
const dmMessages = computed(() => bootstrap.value?.dmMessages || [])
const serverMembers = computed(() => bootstrap.value?.serverMembers || [])
const dmMembers = computed(() => bootstrap.value?.dmMembers || [])
const friends = computed(() => bootstrap.value?.friends || [])
const incomingFriendRequests = computed(() => bootstrap.value?.incomingFriendRequests || [])
const outgoingFriendRequests = computed(() => bootstrap.value?.outgoingFriendRequests || [])
const activeGuildId = computed(() => bootstrap.value?.activeGuildId || null)
const activeGuildName = computed(() => bootstrap.value?.activeGuildName || "Server")
const dmTitle = computed(() => bootstrap.value?.dmTitle || "Direct Messages")
const activeServerChannelId = computed(() => bootstrap.value?.activeServerChannelId || null)
const activeDmThreadId = computed(() => bootstrap.value?.activeDmThreadId || null)
const isServerChatOpen = computed(
  () => view.value === "server" && Boolean(activeServerChannelId.value)
)
const isDmChatOpen = computed(
  () => view.value === "dm" && dmSection.value === "messages" && Boolean(activeDmThreadId.value)
)
const unreadServerCount = computed(() =>
  serverChannels.value.reduce((total, channel) => total + (channel.unread || 0), 0)
)
const unreadDmCount = computed(() =>
  dmList.value.reduce((total, thread) => total + (thread.unreadCount || 0), 0)
)
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

let localStream = null
let remoteStream = null
let remoteAudio = null
let peerConnection = null
let pendingRemoteCandidates = []
let joinedDmThreadIds = new Set()
let joinedServerChannelIds = new Set()

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

function attachRemoteStream(stream) {
  remoteStream = stream

  if (!remoteAudio) {
    remoteAudio = new Audio()
    remoteAudio.autoplay = true
  }

  remoteAudio.srcObject = stream
  remoteAudio.play().catch(() => {})
}

function destroyPeerConnection() {
  if (peerConnection) {
    peerConnection.onicecandidate = null
    peerConnection.ontrack = null
    peerConnection.onconnectionstatechange = null
    peerConnection.close()
    peerConnection = null
  }

  pendingRemoteCandidates = []
}

function stopLocalStream() {
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop())
    localStream = null
  }
}

function stopRemoteStream() {
  if (remoteAudio) {
    remoteAudio.pause()
    remoteAudio.srcObject = null
  }

  if (remoteStream) {
    remoteStream.getTracks().forEach((track) => track.stop())
    remoteStream = null
  }
}

function resetCallState() {
  callStatus.value = "idle"
  callThreadId.value = null
  callRole.value = null
  callMuted.value = false
  incomingCall.value = null
}

async function ensureLocalStream() {
  if (localStream) {
    return localStream
  }

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false,
  })

  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !callMuted.value
  })

  return localStream
}

function createPeerConnection(threadId) {
  if (peerConnection) {
    return peerConnection
  }

  const connection = new RTCPeerConnection(RTC_CONFIGURATION)

  connection.onicecandidate = (event) => {
    if (event.candidate && socket.value) {
      socket.value.emit("webrtc:ice-candidate", {
        threadId,
        candidate: event.candidate,
      })
    }
  }

  connection.ontrack = (event) => {
    const [stream] = event.streams

    if (stream) {
      attachRemoteStream(stream)
      callStatus.value = "active"
    }
  }

  connection.onconnectionstatechange = () => {
    if (["disconnected", "failed", "closed"].includes(connection.connectionState)) {
      if (callThreadId.value) {
        endCall({ notifyPeer: false })
      }
    }
  }

  if (localStream) {
    localStream.getTracks().forEach((track) => connection.addTrack(track, localStream))
  }

  peerConnection = connection
  return connection
}

async function flushPendingIceCandidates() {
  if (!peerConnection || !pendingRemoteCandidates.length) {
    return
  }

  const queuedCandidates = [...pendingRemoteCandidates]
  pendingRemoteCandidates = []

  for (const candidate of queuedCandidates) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
  }
}

async function joinCallRoom(threadId) {
  if (!socket.value) {
    throw new Error("Realtime connection unavailable")
  }

  return new Promise((resolve, reject) => {
    socket.value.emit("call:join", { threadId }, (response) => {
      if (!response?.ok) {
        reject(new Error(response?.error || "Failed to join call"))
        return
      }

      resolve(response)
    })
  })
}

async function createAndSendOffer(threadId) {
  const connection = createPeerConnection(threadId)
  const offer = await connection.createOffer()
  await connection.setLocalDescription(offer)
  socket.value?.emit("webrtc:offer", {
    threadId,
    sdp: offer,
  })
  callStatus.value = "connecting"
}

function clearSession() {
  endCall({ notifyPeer: true, clearIncoming: true })
  token.value = ""
  bootstrap.value = null
  dmSection.value = "friends"
  joinedDmThreadIds = new Set()
  joinedServerChannelIds = new Set()
  localStorage.removeItem("discordmaybe-token")
  socket.value?.disconnect()
  socket.value = null
}

async function markActiveServerChannelRead() {
  if (!bootstrap.value || !activeServerChannelId.value) {
    return
  }

  bootstrap.value.serverChannels = bootstrap.value.serverChannels.map((channel) =>
    channel.id === activeServerChannelId.value
      ? {
          ...channel,
          unread: 0,
          hasUnread: false,
        }
      : channel
  )

  try {
    await apiFetch(`/api/messages/channels/${activeServerChannelId.value}/read`, {
      method: "POST",
    })
  } catch (readError) {
    console.error("Failed to mark channel as read:", readError)
  }
}

async function markActiveDmThreadRead() {
  if (!bootstrap.value || !activeDmThreadId.value) {
    return
  }

  bootstrap.value.dmList = bootstrap.value.dmList.map((thread) =>
    thread.id === activeDmThreadId.value
      ? {
          ...thread,
          unreadCount: 0,
          hasUnread: false,
        }
      : thread
  )

  try {
    await apiFetch(`/api/dms/${activeDmThreadId.value}/read`, {
      method: "POST",
    })
  } catch (readError) {
    console.error("Failed to mark DM as read:", readError)
  }
}

function appendMessage(message) {
  if (!bootstrap.value) {
    return
  }

  if (message.channelId && message.channelId === activeServerChannelId.value) {
    bootstrap.value.serverMessages = [...bootstrap.value.serverMessages, message]
    if (isServerChatOpen.value) {
      void markActiveServerChannelRead()
    }
  }

  if (message.channelId) {
    const previousChannel = bootstrap.value.serverChannels.find(
      (channel) => channel.id === message.channelId
    )

    if (previousChannel) {
      const isActiveChannel = message.channelId === activeServerChannelId.value && isServerChatOpen.value
      const isIncoming = message.user !== currentUser.value.username
      const nextUnreadCount = isActiveChannel ? 0 : previousChannel.unread + (isIncoming ? 1 : 0)

      bootstrap.value.serverChannels = bootstrap.value.serverChannels.map((channel) =>
        channel.id === message.channelId
          ? {
              ...channel,
              unread: nextUnreadCount,
              hasUnread: nextUnreadCount > 0,
            }
          : channel
      )
    }
  }

  if (message.threadId && message.threadId === activeDmThreadId.value) {
    bootstrap.value.dmMessages = [...bootstrap.value.dmMessages, message]
    if (isDmChatOpen.value) {
      void markActiveDmThreadRead()
    }
  }

  if (message.threadId) {
    const previousThread = bootstrap.value.dmList.find((thread) => thread.id === message.threadId)

    if (!previousThread) {
      return
    }

    const previewText = `${message.user === currentUser.value.username ? "You: " : ""}${
      message.text || (message.attachments?.length ? "Sent an attachment" : "Started a conversation")
    }`
    const isActiveThread = message.threadId === activeDmThreadId.value && isDmChatOpen.value
    const isIncoming = message.user !== currentUser.value.username
    const nextUnreadCount = isActiveThread
      ? 0
      : previousThread.unreadCount + (isIncoming ? 1 : 0)

    const nextThread = {
      ...previousThread,
      preview: previewText,
      subtitle: previewText,
      lastMessageAuthorId: previousThread.lastMessageAuthorId,
      lastMessageAt: new Date().toISOString(),
      unreadCount: nextUnreadCount,
      hasUnread: nextUnreadCount > 0,
    }

    bootstrap.value.dmList = [
      nextThread,
      ...bootstrap.value.dmList.filter((thread) => thread.id !== message.threadId),
    ]
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
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Failed to load Socket.IO client")),
        {
          once: true,
        }
      )
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

function registerRealtimeEvents(nextSocket) {
  nextSocket.on("message:new", (message) => {
    appendMessage(message)
  })

  nextSocket.on("call:incoming", ({ threadId, fromUsername }) => {
    if (callThreadId.value === threadId) {
      return
    }

    incomingCall.value = {
      threadId,
      fromUsername,
    }

    if (activeDmThreadId.value === threadId) {
      callStatus.value = "incoming"
    }
  })

  nextSocket.on("call:participant-joined", async ({ threadId }) => {
    if (threadId !== callThreadId.value || callRole.value !== "caller") {
      return
    }

    try {
      if (!peerConnection || !peerConnection.localDescription) {
        await createAndSendOffer(threadId)
      }
    } catch (participantError) {
      callError.value = participantError.message
    }
  })

  nextSocket.on("call:participant-left", ({ threadId }) => {
    if (threadId === callThreadId.value) {
      endCall({ notifyPeer: false })
    }
  })

  nextSocket.on("webrtc:offer", async ({ threadId, sdp, fromUsername }) => {
    if (threadId !== callThreadId.value) {
      return
    }

    try {
      const connection = createPeerConnection(threadId)
      await connection.setRemoteDescription(new RTCSessionDescription(sdp))
      await flushPendingIceCandidates()
      const answer = await connection.createAnswer()
      await connection.setLocalDescription(answer)
      nextSocket.emit("webrtc:answer", {
        threadId,
        sdp: answer,
      })
      callStatus.value = "connecting"
      if (!incomingCall.value) {
        incomingCall.value = {
          threadId,
          fromUsername,
        }
      }
    } catch (offerError) {
      callError.value = offerError.message
    }
  })

  nextSocket.on("webrtc:answer", async ({ threadId, sdp }) => {
    if (threadId !== callThreadId.value || !peerConnection) {
      return
    }

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp))
      await flushPendingIceCandidates()
      callStatus.value = "active"
    } catch (answerError) {
      callError.value = answerError.message
    }
  })

  nextSocket.on("webrtc:ice-candidate", async ({ threadId, candidate }) => {
    if (threadId !== callThreadId.value || !candidate) {
      return
    }

    try {
      if (!peerConnection || !peerConnection.remoteDescription) {
        pendingRemoteCandidates.push(candidate)
        return
      }

      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (candidateError) {
      callError.value = candidateError.message
    }
  })
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

    registerRealtimeEvents(nextSocket)
    nextSocket.on("connect", () => {
      joinedDmThreadIds = new Set()
      joinedServerChannelIds = new Set()
      void joinActiveRooms()
      syncDmRooms()
      syncServerRooms()
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

  if (activeDmThreadId.value) {
    socket.value.emit("thread:join", activeDmThreadId.value)
  }
}

function syncDmRooms() {
  if (!socket.value) {
    return
  }

  const nextThreadIds = new Set(dmList.value.map((thread) => thread.id).filter(Boolean))

  joinedDmThreadIds.forEach((threadId) => {
    if (!nextThreadIds.has(threadId)) {
      socket.value.emit("thread:leave", threadId)
    }
  })

  nextThreadIds.forEach((threadId) => {
    if (!joinedDmThreadIds.has(threadId)) {
      socket.value.emit("thread:join", threadId)
    }
  })

  joinedDmThreadIds = nextThreadIds
}

function syncServerRooms() {
  if (!socket.value) {
    return
  }

  const nextChannelIds = new Set(serverChannels.value.map((channel) => channel.id).filter(Boolean))

  joinedServerChannelIds.forEach((channelId) => {
    if (!nextChannelIds.has(channelId)) {
      socket.value.emit("channel:leave", channelId)
    }
  })

  nextChannelIds.forEach((channelId) => {
    if (!joinedServerChannelIds.has(channelId)) {
      socket.value.emit("channel:join", channelId)
    }
  })

  joinedServerChannelIds = nextChannelIds
}

async function fetchBootstrap(overrides = {}) {
  const query = buildBootstrapQuery(overrides)
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

async function loadBootstrap(overrides = {}) {
  if (!token.value) {
    bootstrap.value = null
    loading.value = false
    error.value = ""
    return
  }

  loading.value = true
  error.value = ""

  try {
    bootstrap.value = await fetchBootstrap(overrides)
  } catch (fetchError) {
    error.value = fetchError.message
  } finally {
    loading.value = false
  }
}

async function handleSelectServerChannel(channelId) {
  if (!channelId || channelId === activeServerChannelId.value) {
    view.value = "server"
    return
  }

  view.value = "server"
  loading.value = true

  try {
    bootstrap.value = await fetchBootstrap({ serverChannelId: channelId })
    if (isServerChatOpen.value) {
      await markActiveServerChannelRead()
    }
    error.value = ""
  } catch (fetchError) {
    error.value = fetchError.message
  } finally {
    loading.value = false
  }
}

async function handleSelectDm(threadId) {
  dmSection.value = "messages"

  if (!threadId || threadId === activeDmThreadId.value) {
    view.value = "dm"
    if (isDmChatOpen.value) {
      await markActiveDmThreadRead()
    }
    return
  }

  view.value = "dm"
  loading.value = true

  try {
    bootstrap.value = await fetchBootstrap({ dmThreadId: threadId })
    await markActiveDmThreadRead()
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
    if (isServerChatOpen.value) {
      await markActiveServerChannelRead()
    }
    return
  }

  loading.value = true
  error.value = ""

  try {
    bootstrap.value = await fetchBootstrap({
      guildId,
      serverChannelId: null,
      dmThreadId: null,
    })
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

function setView(nextView) {
  view.value = nextView

  if (nextView === "dm") {
    dmSection.value = activeDmThreadId.value ? "messages" : "friends"
  }
}

function setDmSection(section) {
  dmSection.value = section
  view.value = "dm"
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

    bootstrap.value = await fetchBootstrap({
      guildId: data.activeGuildId,
      serverChannelId: data.activeServerChannelId,
      dmThreadId: null,
    })
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

    bootstrap.value = await fetchBootstrap({
      guildId: activeGuildId.value,
      serverChannelId: data.channel.id,
    })
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
  const payload =
    nextView === "server"
      ? { channelId: activeServerChannelId.value, content, attachments }
      : { threadId: activeDmThreadId.value, content, attachments }

  if (!payload.channelId && !payload.threadId) {
    return
  }

  try {
    const response = await apiFetch("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      if (response.status === 401) {
        clearSession()
        return
      }

      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to send message (${response.status})`)
    }

    const createdMessage = await response.json()

    if (!socket.value?.connected) {
      appendMessage(createdMessage)
    }

    error.value = ""
  } catch (sendError) {
    error.value = sendError.message
    console.error("Failed to send message:", sendError)
  }
}

async function handleSendFriendRequest(username) {
  const trimmedUsername = username.trim()

  if (!trimmedUsername) {
    error.value = "Enter a username."
    return
  }

  try {
    const response = await apiFetch("/api/friends/requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: trimmedUsername }),
    })
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || `Failed to send friend request (${response.status})`)
    }

    await loadBootstrap()
    view.value = "dm"
    dmSection.value = "friends"
  } catch (requestError) {
    error.value = requestError.message
  }
}

async function handleAcceptFriendRequest(requestId) {
  try {
    const response = await apiFetch(`/api/friends/requests/${requestId}/accept`, {
      method: "POST",
    })
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || `Failed to accept request (${response.status})`)
    }

    await loadBootstrap()
    view.value = "dm"
    dmSection.value = "friends"
  } catch (acceptError) {
    error.value = acceptError.message
  }
}

async function handleOpenDmWithFriend(friendUserId) {
  try {
    const response = await apiFetch("/api/dms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ friendUserId }),
    })
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || `Failed to open DM (${response.status})`)
    }

    await loadBootstrap({ dmThreadId: data.threadId })
    view.value = "dm"
    dmSection.value = "messages"
  } catch (dmError) {
    error.value = dmError.message
  }
}

async function startCall() {
  if (view.value !== "dm" || dmSection.value !== "messages" || !activeDmThreadId.value) {
    return
  }

  if (callThreadId.value && callThreadId.value !== activeDmThreadId.value) {
    callError.value = "Finish the current call before starting another one."
    return
  }

  try {
    callError.value = ""
    await ensureLocalStream()
    const threadId = activeDmThreadId.value
    callThreadId.value = threadId
    callRole.value = "caller"
    callStatus.value = "calling"
    incomingCall.value = null
    createPeerConnection(threadId)
    await joinCallRoom(threadId)
    socket.value?.emit("call:invite", { threadId })
  } catch (startError) {
    callError.value = startError.message
    endCall({ notifyPeer: false })
  }
}

async function acceptCall() {
  const nextIncomingCall = incomingCall.value

  if (!nextIncomingCall?.threadId) {
    return
  }

  try {
    callError.value = ""

    if (activeDmThreadId.value !== nextIncomingCall.threadId) {
      await loadBootstrap({ dmThreadId: nextIncomingCall.threadId })
      view.value = "dm"
      dmSection.value = "messages"
    }

    await ensureLocalStream()
    callThreadId.value = nextIncomingCall.threadId
    callRole.value = "callee"
    callStatus.value = "connecting"
    createPeerConnection(nextIncomingCall.threadId)
    await joinCallRoom(nextIncomingCall.threadId)
    incomingCall.value = null
  } catch (acceptError) {
    callError.value = acceptError.message
    endCall({ notifyPeer: false })
  }
}

function declineCall() {
  incomingCall.value = null

  if (callStatus.value === "incoming") {
    callStatus.value = "idle"
  }
}

function endCall({ notifyPeer = true, clearIncoming = true } = {}) {
  const threadId = callThreadId.value

  if (notifyPeer && socket.value && threadId) {
    socket.value.emit("call:leave", { threadId })
  }

  destroyPeerConnection()
  stopLocalStream()
  stopRemoteStream()
  resetCallState()

  if (!clearIncoming) {
    return
  }

  incomingCall.value = null
}

function toggleMute() {
  callMuted.value = !callMuted.value

  if (localStream) {
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !callMuted.value
    })
  }
}

watch(activeServerChannelId, (nextId, previousId) => {
  if (!socket.value) {
    return
  }
})

watch(activeDmThreadId, (nextId, previousId) => {
  if (!socket.value) {
    return
  }

  if (incomingCall.value?.threadId === nextId && callStatus.value === "idle") {
    callStatus.value = "incoming"
  }
})

watch(dmList, () => {
  syncDmRooms()
})

watch(serverChannels, () => {
  syncServerRooms()
})

watch(isServerChatOpen, async (isOpen) => {
  if (isOpen) {
    await markActiveServerChannelRead()
  }
})

watch(isDmChatOpen, async (isOpen) => {
  if (isOpen) {
    await markActiveDmThreadRead()
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
  endCall({ notifyPeer: true })
  joinedDmThreadIds = new Set()
  joinedServerChannelIds = new Set()
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
      @set-view="setView"
      @select-guild="handleSelectGuild"
      @create-server="openCreateServer"
    />
    <Sidebar
      :view="view"
      :dm-section="dmSection"
      :server-channels="serverChannels"
      :dm-list="dmList"
      :active-guild-name="activeGuildName"
      :current-user="currentUser"
      :server-channel-name="serverChannelName"
      :friend-count="friends.length"
      :request-count="incomingFriendRequests.length"
      :unread-dm-count="unreadDmCount"
      :unread-server-count="unreadServerCount"
      @logout="clearSession"
      @set-dm-section="setDmSection"
      @open-create-channel="openCreateChannel"
      @select-server-channel="handleSelectServerChannel"
      @select-dm="handleSelectDm"
    />
    <ChatMain
      :send-message="handleSendMessage"
      :send-friend-request="handleSendFriendRequest"
      :accept-friend-request="handleAcceptFriendRequest"
      :open-dm-with-friend="handleOpenDmWithFriend"
      :start-call="startCall"
      :accept-call="acceptCall"
      :decline-call="declineCall"
      :end-call="endCall"
      :toggle-mute="toggleMute"
      :view="view"
      :dm-section="dmSection"
      :server-messages="serverMessages"
      :dm-messages="dmMessages"
      :server-channel-name="serverChannelName"
      :dm-title="dmTitle"
      :friends="friends"
      :incoming-friend-requests="incomingFriendRequests"
      :outgoing-friend-requests="outgoingFriendRequests"
      :error="error"
      :call-error="callError"
      :call-status="callStatus"
      :call-thread-id="callThreadId"
      :active-dm-thread-id="activeDmThreadId"
      :incoming-call="incomingCall"
      :call-muted="callMuted"
      :current-user="currentUser"
    />
    <Members
      :view="view"
      :dm-section="dmSection"
      :server-members="serverMembers"
      :dm-members="dmMembers"
      :friends="friends"
      :incoming-friend-requests="incomingFriendRequests"
    />
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
