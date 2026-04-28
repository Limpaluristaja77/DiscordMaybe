async function readJson(response) {
  return response.json().catch(() => ({}))
}

async function expectJson(response, fallbackMessage) {
  const data = await readJson(response)

  if (!response.ok) {
    throw new Error(data.error || `${fallbackMessage} (${response.status})`)
  }

  return data
}

export async function authenticateUser({ mode, payload }) {
  const response = await fetch(`/api/auth/${mode}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  return expectJson(response, `${mode} failed`)
}

export async function createServer(apiFetch, name) {
  const response = await apiFetch("/api/guilds", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  })

  return expectJson(response, "Failed to create server")
}

export async function createChannel(apiFetch, guildId, name) {
  const response = await apiFetch(`/api/guilds/${guildId}/channels`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  })

  return expectJson(response, "Failed to create channel")
}

export async function sendMessage(apiFetch, payload) {
  const response = await apiFetch("/api/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  return response
}

export async function sendFriendRequest(apiFetch, username) {
  const response = await apiFetch("/api/friends/requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username }),
  })

  return expectJson(response, "Failed to send friend request")
}

export async function acceptFriendRequest(apiFetch, requestId) {
  const response = await apiFetch(`/api/friends/requests/${requestId}/accept`, {
    method: "POST",
  })

  return expectJson(response, "Failed to accept request")
}

export async function openDm(apiFetch, friendUserId) {
  const response = await apiFetch("/api/dms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ friendUserId }),
  })

  return expectJson(response, "Failed to open DM")
}

export async function markChannelRead(apiFetch, channelId) {
  return apiFetch(`/api/messages/channels/${channelId}/read`, {
    method: "POST",
  })
}

export async function markDmRead(apiFetch, threadId) {
  return apiFetch(`/api/dms/${threadId}/read`, {
    method: "POST",
  })
}
