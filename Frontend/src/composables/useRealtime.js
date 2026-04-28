import { ref } from "vue"

const RTC_CONFIGURATION = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
}

export function useRealtime({
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
}) {
  const socket = ref(null)
  const callStatus = ref("idle")
  const callThreadId = ref(null)
  const callRole = ref(null)
  const callMuted = ref(false)
  const incomingCall = ref(null)
  const callError = ref("")

  let localStream = null
  let remoteStream = null
  let remoteAudio = null
  let peerConnection = null
  let pendingRemoteCandidates = []
  let joinedDmThreadIds = new Set()
  let joinedServerChannelIds = new Set()

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

  async function startCall({ view, dmSection, threadId }) {
    if (view !== "dm" || dmSection !== "messages" || !threadId) {
      return
    }

    if (callThreadId.value && callThreadId.value !== threadId) {
      callError.value = "Finish the current call before starting another one."
      return
    }

    try {
      callError.value = ""
      await ensureLocalStream()
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
        await loadDmThread(nextIncomingCall.threadId)
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

  function handleActiveDmChange(nextId) {
    if (incomingCall.value?.threadId === nextId && callStatus.value === "idle") {
      callStatus.value = "incoming"
    }
  }

  function disconnectRealtime() {
    endCall({ notifyPeer: true })
    joinedDmThreadIds = new Set()
    joinedServerChannelIds = new Set()
    socket.value?.disconnect()
    socket.value = null
  }

  return {
    acceptCall,
    callError,
    callMuted,
    callStatus,
    callThreadId,
    connectRealtime,
    declineCall,
    disconnectRealtime,
    endCall,
    handleActiveDmChange,
    incomingCall,
    joinActiveRooms,
    socket,
    startCall,
    syncDmRooms,
    syncServerRooms,
    toggleMute,
  }
}
