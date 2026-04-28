import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRealtime } from "./useRealtime"
import { useSession } from "./useSession"
import {
  acceptFriendRequest,
  authenticateUser,
  createChannel,
  createServer,
  markChannelRead,
  markDmRead,
  openDm,
  sendFriendRequest,
  sendMessage,
} from "../services/appApi"

export function useDiscordApp() {
  const view = ref("server")
  const dmSection = ref("friends")
  const createServerName = ref("")
  const creatingServer = ref(false)
  const isCreateServerOpen = ref(false)
  const createChannelName = ref("")
  const creatingChannel = ref(false)
  const isCreateChannelOpen = ref(false)

  const {
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
  } = useSession()

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

  function getActiveState() {
    return {
      activeDmThreadId: activeDmThreadId.value,
      activeGuildId: activeGuildId.value,
      activeServerChannelId: activeServerChannelId.value,
    }
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
      await markChannelRead(apiFetch, activeServerChannelId.value)
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
      await markDmRead(apiFetch, activeDmThreadId.value)
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
        const isActiveChannel =
          message.channelId === activeServerChannelId.value && isServerChatOpen.value
        const isIncoming = message.user !== currentUser.value.username
        const nextUnreadCount = isActiveChannel
          ? 0
          : previousChannel.unread + (isIncoming ? 1 : 0)

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

  async function loadDmThread(threadId) {
    await loadBootstrap(getActiveState(), { dmThreadId: threadId }, { silent: true })
    view.value = "dm"
    dmSection.value = "messages"
  }

  const realtime = useRealtime({
    activeDmThreadId,
    activeServerChannelId,
    appendMessage,
    currentUser,
    dmList,
    isDmChatOpen,
    isServerChatOpen,
    loadDmThread,
    markActiveDmThreadRead,
    markActiveServerChannelRead,
    serverChannels,
    token,
  })

  function setActiveServerChannelLocally(channelId) {
    if (!bootstrap.value) {
      return
    }

    bootstrap.value.serverChannels = bootstrap.value.serverChannels.map((channel) => ({
      ...channel,
      active: channel.id === channelId,
    }))
  }

  function setActiveDmThreadLocally(threadId) {
    if (!bootstrap.value) {
      return
    }

    bootstrap.value.dmList = bootstrap.value.dmList.map((thread) => ({
      ...thread,
      active: thread.id === threadId,
    }))
  }

  async function handleSelectServerChannel(channelId) {
    if (!channelId || channelId === activeServerChannelId.value) {
      view.value = "server"
      return
    }

    view.value = "server"
    setActiveServerChannelLocally(channelId)
    contentLoading.value = true

    try {
      mergeBootstrap(await fetchBootstrap(getActiveState(), { serverChannelId: channelId }))
      if (isServerChatOpen.value) {
        await markActiveServerChannelRead()
      }
      clearError()
    } catch (fetchError) {
      setError(fetchError.message)
    } finally {
      contentLoading.value = false
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
    setActiveDmThreadLocally(threadId)
    contentLoading.value = true

    try {
      mergeBootstrap(await fetchBootstrap(getActiveState(), { dmThreadId: threadId }))
      await markActiveDmThreadRead()
      clearError()
    } catch (fetchError) {
      setError(fetchError.message)
    } finally {
      contentLoading.value = false
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

    contentLoading.value = true
    clearError()

    try {
      mergeBootstrap(
        await fetchBootstrap(getActiveState(), {
          guildId,
          serverChannelId: null,
          dmThreadId: null,
        })
      )
    } catch (fetchError) {
      setError(fetchError.message)
    } finally {
      contentLoading.value = false
    }
  }

  function openCreateServer() {
    createServerName.value = ""
    clearError()
    isCreateServerOpen.value = true
  }

  function closeCreateServer() {
    if (!creatingServer.value) {
      isCreateServerOpen.value = false
    }
  }

  function openCreateChannel() {
    if (view.value !== "server" || !activeGuildId.value) {
      return
    }

    createChannelName.value = ""
    clearError()
    isCreateChannelOpen.value = true
  }

  function closeCreateChannel() {
    if (!creatingChannel.value) {
      isCreateChannelOpen.value = false
    }
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
      setError("Enter a server name.")
      return
    }

    creatingServer.value = true
    clearError()

    try {
      const data = await createServer(apiFetch, name)
      bootstrap.value = await fetchBootstrap(getActiveState(), {
        guildId: data.activeGuildId,
        serverChannelId: data.activeServerChannelId,
        dmThreadId: null,
      })
      view.value = "server"
      isCreateServerOpen.value = false
      createServerName.value = ""
    } catch (creationError) {
      setError(creationError.message)
    } finally {
      creatingServer.value = false
    }
  }

  async function handleCreateChannel() {
    const name = createChannelName.value.trim()

    if (!activeGuildId.value) {
      setError("Select a server first.")
      return
    }

    if (!name) {
      setError("Enter a channel name.")
      return
    }

    creatingChannel.value = true
    clearError()

    try {
      const data = await createChannel(apiFetch, activeGuildId.value, name)
      bootstrap.value = await fetchBootstrap(getActiveState(), {
        guildId: activeGuildId.value,
        serverChannelId: data.channel.id,
      })
      view.value = "server"
      isCreateChannelOpen.value = false
      createChannelName.value = ""
    } catch (creationError) {
      setError(creationError.message)
    } finally {
      creatingChannel.value = false
    }
  }

  async function handleAuthenticate({ mode, payload }) {
    const data = await authenticateUser({ mode, payload })
    persistToken(data.token)
    await loadBootstrap(getActiveState())
    await realtime.connectRealtime()
    await realtime.joinActiveRooms()
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
      const response = await sendMessage(apiFetch, payload)

      if (!response.ok) {
        if (response.status === 401) {
          handleLogout()
          return
        }

        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `Failed to send message (${response.status})`)
      }

      const createdMessage = await response.json()

      if (!realtime.socket.value?.connected) {
        appendMessage(createdMessage)
      }

      clearError()
    } catch (sendError) {
      setError(sendError.message)
      console.error("Failed to send message:", sendError)
    }
  }

  async function handleSendFriendRequest(username) {
    const trimmedUsername = username.trim()

    if (!trimmedUsername) {
      setError("Enter a username.")
      return
    }

    try {
      await sendFriendRequest(apiFetch, trimmedUsername)
      await loadBootstrap(getActiveState(), {}, { silent: true })
      view.value = "dm"
      dmSection.value = "friends"
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function handleAcceptFriendRequest(requestId) {
    try {
      await acceptFriendRequest(apiFetch, requestId)
      await loadBootstrap(getActiveState(), {}, { silent: true })
      view.value = "dm"
      dmSection.value = "friends"
    } catch (acceptError) {
      setError(acceptError.message)
    }
  }

  async function handleOpenDmWithFriend(friendUserId) {
    try {
      const data = await openDm(apiFetch, friendUserId)
      await loadBootstrap(getActiveState(), { dmThreadId: data.threadId }, { silent: true })
      view.value = "dm"
      dmSection.value = "messages"
    } catch (dmError) {
      setError(dmError.message)
    }
  }

  async function handleStartCall() {
    await realtime.startCall({
      dmSection: dmSection.value,
      threadId: activeDmThreadId.value,
      view: view.value,
    })
  }

  function handleLogout() {
    realtime.disconnectRealtime()
    clearSession()
    dmSection.value = "friends"
  }

  watch(activeDmThreadId, (nextId) => {
    realtime.handleActiveDmChange(nextId)
  })

  watch(dmList, () => {
    realtime.syncDmRooms()
  })

  watch(serverChannels, () => {
    realtime.syncServerRooms()
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
    await loadBootstrap(getActiveState())

    if (!token.value) {
      return
    }

    await realtime.connectRealtime()
    await realtime.joinActiveRooms()
  })

  onBeforeUnmount(() => {
    realtime.disconnectRealtime()
  })

  return {
    acceptCall: realtime.acceptCall,
    activeDmThreadId,
    activeGuildId,
    activeGuildName,
    bootstrap,
    callError: realtime.callError,
    callMuted: realtime.callMuted,
    callStatus: realtime.callStatus,
    callThreadId: realtime.callThreadId,
    closeCreateChannel,
    closeCreateServer,
    contentLoading,
    createChannelName,
    createServerName,
    creatingChannel,
    creatingServer,
    currentUser,
    declineCall: realtime.declineCall,
    dmList,
    dmMembers,
    dmSection,
    dmMessages,
    dmTitle,
    endCall: realtime.endCall,
    error,
    friends,
    guilds,
    handleAcceptFriendRequest,
    handleAuthenticate,
    handleCreateChannel,
    handleCreateServer,
    handleLogout,
    handleOpenDmWithFriend,
    handleSelectDm,
    handleSelectGuild,
    handleSelectServerChannel,
    handleSendFriendRequest,
    handleSendMessage,
    handleStartCall,
    incomingCall: realtime.incomingCall,
    incomingFriendRequests,
    isAuthenticated,
    isCreateChannelOpen,
    isCreateServerOpen,
    loading,
    openCreateChannel,
    openCreateServer,
    outgoingFriendRequests,
    serverChannelName,
    serverChannels,
    serverMembers,
    serverMessages,
    setDmSection,
    setView,
    toggleMute: realtime.toggleMute,
    unreadDmCount,
    unreadServerCount,
    view,
  }
}
