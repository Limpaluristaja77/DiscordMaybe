<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

const draft = ref("")
const friendUsername = ref("")
const chatScroller = ref(null)
const fileInput = ref(null)
const draftInput = ref(null)
const queuedFiles = ref([])
const emojiPicker = ref(null)
const isEmojiPickerOpen = ref(false)
const emojis = [
  0x1f600,
  0x1f602,
  0x1f972,
  0x1f60d,
  0x1f914,
  0x1f62d,
  0x1f60e,
  0x1f634,
  0x1f621,
  0x1f44d,
  0x1f64f,
  0x1f44f,
  0x1f525,
  0x2728,
  0x1f480,
  0x1f49c,
  0x2764,
  0x1f389,
  0x1f680,
  0x1f63a,
].map((codePoint) => String.fromCodePoint(codePoint))

const props = defineProps({
  sendMessage: { type: Function, required: true },
  sendFriendRequest: { type: Function, required: true },
  acceptFriendRequest: { type: Function, required: true },
  openDmWithFriend: { type: Function, required: true },
  startCall: { type: Function, required: true },
  acceptCall: { type: Function, required: true },
  declineCall: { type: Function, required: true },
  endCall: { type: Function, required: true },
  toggleMute: { type: Function, required: true },
  view: { type: String, required: true },
  dmSection: { type: String, required: true },
  serverMessages: { type: Array, required: true },
  dmMessages: { type: Array, required: true },
  serverChannelName: { type: String, required: true },
  dmTitle: { type: String, required: true },
  friends: { type: Array, required: true },
  incomingFriendRequests: { type: Array, required: true },
  outgoingFriendRequests: { type: Array, required: true },
  error: { type: String, default: "" },
  callError: { type: String, default: "" },
  callStatus: { type: String, required: true },
  callThreadId: { type: String, default: null },
  activeDmThreadId: { type: String, default: null },
  incomingCall: { type: Object, default: null },
  callMuted: { type: Boolean, required: true },
  currentUser: { type: Object, required: true },
  contentLoading: { type: Boolean, default: false },
})

const activeMessages = computed(() =>
  props.view === "server" ? props.serverMessages : props.dmMessages
)
const isFriendsHub = computed(() => props.view === "dm" && props.dmSection === "friends")
const isDmMessagesView = computed(() => props.view === "dm" && props.dmSection === "messages")
const isCallForActiveThread = computed(
  () => props.callThreadId && props.callThreadId === props.activeDmThreadId
)
const showIncomingCall = computed(
  () => props.incomingCall?.threadId && props.incomingCall.threadId === props.activeDmThreadId
)
const canStartCall = computed(
  () =>
    isDmMessagesView.value &&
    (!props.callThreadId || props.callThreadId === props.activeDmThreadId) &&
    props.callStatus === "idle"
)
const showCallStage = computed(
  () => isDmMessagesView.value && isCallForActiveThread.value && props.callStatus !== "idle"
)
const callStatusLabel = computed(() => {
  const labels = {
    incoming: "Incoming call",
    calling: "Calling...",
    connecting: "Connecting...",
    active: "Voice connected",
    idle: "",
  }

  return labels[props.callStatus] || ""
})
const remoteDisplayName = computed(
  () => props.incomingCall?.fromUsername || props.dmTitle || "Friend"
)
const localDisplayName = computed(() => props.currentUser?.username || "You")
const remoteInitial = computed(() => remoteDisplayName.value.slice(0, 1).toUpperCase())
const localInitial = computed(() => localDisplayName.value.slice(0, 1).toUpperCase())

async function scrollToBottom() {
  if (isFriendsHub.value) {
    return
  }

  await nextTick()
  chatScroller.value?.scrollTo({
    top: chatScroller.value.scrollHeight,
    behavior: "smooth",
  })
}

function openFilePicker() {
  fileInput.value?.click()
}

function handleFileSelection(event) {
  const selectedFiles = Array.from(event.target.files || [])
  queuedFiles.value = selectedFiles.slice(0, 4)
}

function removeQueuedFile(index) {
  queuedFiles.value = queuedFiles.value.filter((_, fileIndex) => fileIndex !== index)

  if (queuedFiles.value.length === 0 && fileInput.value) {
    fileInput.value.value = ""
  }
}

function toggleEmojiPicker() {
  isEmojiPickerOpen.value = !isEmojiPickerOpen.value
}

async function insertEmoji(emoji) {
  const input = draftInput.value

  if (!input) {
    draft.value += emoji
    isEmojiPickerOpen.value = false
    return
  }

  const start = input.selectionStart ?? draft.value.length
  const end = input.selectionEnd ?? draft.value.length
  draft.value = `${draft.value.slice(0, start)}${emoji}${draft.value.slice(end)}`
  isEmojiPickerOpen.value = false

  await nextTick()
  input.focus()
  const cursor = start + emoji.length
  input.setSelectionRange(cursor, cursor)
}

function handleDocumentClick(event) {
  if (!emojiPicker.value?.contains(event.target)) {
    isEmojiPickerOpen.value = false
  }
}

async function submitMessage() {
  const content = draft.value.trim()

  if (!content && queuedFiles.value.length === 0) {
    return
  }

  const attachments = await Promise.all(
    queuedFiles.value.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () =>
            resolve({
              fileName: file.name,
              mimeType: file.type || "application/octet-stream",
              sizeBytes: file.size,
              dataUrl: reader.result,
            })
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
          reader.readAsDataURL(file)
        })
    )
  )

  await props.sendMessage({
    view: props.view,
    content,
    attachments,
  })

  draft.value = ""
  queuedFiles.value = []

  if (fileInput.value) {
    fileInput.value.value = ""
  }
}

async function submitFriendRequest() {
  const username = friendUsername.value.trim()

  if (!username) {
    return
  }

  await props.sendFriendRequest(username)
  friendUsername.value = ""
}

watch(
  () => activeMessages.value.length,
  () => {
    scrollToBottom()
  },
  { immediate: true }
)

watch([isFriendsHub, showCallStage], ([nextFriendsHub, nextShowCallStage]) => {
  if (nextFriendsHub || nextShowCallStage) {
    draft.value = ""
    queuedFiles.value = []
  }
})

onMounted(() => {
  document.addEventListener("click", handleDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener("click", handleDocumentClick)
})
</script>

<template>
  <main class="main" :class="{ 'main--call': showCallStage }">
    <header class="main__header" :class="{ 'main__header--call': showCallStage }">
      <div class="channel-title" :class="{ 'channel-title--call': showCallStage }">
        <span class="channel-title__hash">
          {{ view === "server" ? "#" : dmSection === "friends" ? "FR" : "DM" }}
        </span>
        <span>
          {{
            view === "server"
              ? serverChannelName
              : dmSection === "friends"
                ? "Friends"
                : dmTitle
          }}
        </span>
      </div>
      <div class="header__actions" :class="{ 'header__actions--call': showCallStage }">
        <button
          class="icon-btn"
          :class="{ 'icon-btn--active': showCallStage }"
          :disabled="!canStartCall"
          title="Call"
          @click="startCall"
        >
          &#128222;
        </button>
        <button class="icon-btn" title="Video" disabled>&#128249;</button>
        <button class="icon-btn" title="Pins">&#128204;</button>
        <button class="icon-btn" title="Members">&#128101;</button>
        <button class="icon-btn" title="Search">&#128270;</button>
      </div>
    </header>

    <section v-if="isFriendsHub" class="friends-hub">
      <div class="friends-hub__hero">
        <div class="chat__badge">Social</div>
        <h1 class="chat__title">Friends</h1>
        <p class="chat__subtitle">
          Add someone by username, accept incoming requests, and open direct messages once you are
          friends.
        </p>
      </div>

      <div class="friends-hub__card">
        <div class="friends-hub__heading">Add Friend</div>
        <div class="friends-hub__form">
          <input
            v-model="friendUsername"
            class="auth-input"
            type="text"
            placeholder="Enter username"
            @keydown.enter.prevent="submitFriendRequest"
          />
          <button class="auth-submit" @click="submitFriendRequest">Send Request</button>
        </div>
        <p v-if="error" class="auth-error">{{ error }}</p>
      </div>

      <div class="friends-hub__grid">
        <section class="friends-panel">
          <div class="friends-panel__header">
            <h2>Friends</h2>
            <span>{{ friends.length }}</span>
          </div>
          <div v-if="friends.length" class="friends-list">
            <div v-for="friend in friends" :key="friend.id" class="friend-row">
              <div class="friend-row__identity">
                <div class="friend-row__avatar">{{ friend.username[0] }}</div>
                <div>
                  <div class="friend-row__name">{{ friend.username }}</div>
                  <div class="friend-row__meta">{{ friend.tag }} - {{ friend.status }}</div>
                </div>
              </div>
              <button class="auth-toggle__btn friend-row__action" @click="openDmWithFriend(friend.id)">
                Message
              </button>
            </div>
          </div>
          <div v-else class="friends-panel__empty">No friends yet. Send a request to get started.</div>
        </section>

        <section class="friends-panel">
          <div class="friends-panel__header">
            <h2>Incoming Requests</h2>
            <span>{{ incomingFriendRequests.length }}</span>
          </div>
          <div v-if="incomingFriendRequests.length" class="friends-list">
            <div v-for="request in incomingFriendRequests" :key="request.id" class="friend-row">
              <div class="friend-row__identity">
                <div class="friend-row__avatar">{{ request.username[0] }}</div>
                <div>
                  <div class="friend-row__name">{{ request.username }}</div>
                  <div class="friend-row__meta">{{ request.tag }}</div>
                </div>
              </div>
              <button
                class="auth-submit friend-row__action"
                @click="acceptFriendRequest(request.id)"
              >
                Accept
              </button>
            </div>
          </div>
          <div v-else class="friends-panel__empty">No pending incoming requests.</div>
        </section>
      </div>

      <section class="friends-panel">
        <div class="friends-panel__header">
          <h2>Outgoing Requests</h2>
          <span>{{ outgoingFriendRequests.length }}</span>
        </div>
        <div v-if="outgoingFriendRequests.length" class="friends-list">
          <div v-for="request in outgoingFriendRequests" :key="request.id" class="friend-row">
            <div class="friend-row__identity">
              <div class="friend-row__avatar">{{ request.username[0] }}</div>
              <div>
                <div class="friend-row__name">{{ request.username }}</div>
                <div class="friend-row__meta">{{ request.tag }} - waiting for reply</div>
              </div>
            </div>
            <span class="friend-row__status">Pending</span>
          </div>
        </div>
        <div v-else class="friends-panel__empty">You have no outgoing friend requests.</div>
      </section>
    </section>

    <section v-else-if="showCallStage" class="call-shell">
      <section class="call-stage call-stage--embedded">
        <div class="call-stage__center">
          <div class="call-stage__avatar-stack">
            <div class="call-stage__orb call-stage__orb--remote">{{ remoteInitial }}</div>
            <div class="call-stage__orb call-stage__orb--local">{{ localInitial }}</div>
          </div>
          <div class="call-stage__caption">
            {{ props.callStatus === "active" ? "You are in a voice call." : callStatusLabel }}
          </div>
          <div v-if="props.callError" class="auth-error">{{ props.callError }}</div>
        </div>

        <div class="call-stage__controls">
          <div class="call-deck">
            <button class="call-control" @click="toggleMute">
              {{ callMuted ? "Unmute" : "Mute" }}
            </button>
            <button class="call-control call-control--chevron">&#709;</button>
            <button class="call-control call-control--ghost">Noise</button>
            <button class="call-control call-control--chevron">&#709;</button>
          </div>
          <div class="call-deck">
            <button
              v-if="showIncomingCall && callStatus === 'incoming'"
              class="call-control call-control--accept"
              @click="acceptCall"
            >
              Accept
            </button>
            <button v-else class="call-control call-control--ghost">Share</button>
            <button
              v-if="showIncomingCall && callStatus === 'incoming'"
              class="call-control call-control--ghost"
              @click="declineCall"
            >
              Decline
            </button>
            <button v-else class="call-control call-control--ghost">Effects</button>
            <button
              v-if="!showIncomingCall || callStatus !== 'incoming'"
              class="call-control call-control--ghost"
            >
              More
            </button>
          </div>
          <button class="call-control call-control--hangup" @click="endCall()">&#128222;</button>
        </div>
      </section>
      <section ref="chatScroller" class="chat chat--with-call">
        <div v-if="contentLoading" class="chat__loading">Refreshing conversation...</div>
        <div class="chat__intro">
          <div class="chat__badge">{{ new Date().toLocaleDateString() }}</div>
          <h1 class="chat__title">
            {{ view === "server" ? serverChannelName : dmTitle }}
          </h1>
          <p class="chat__subtitle">This is the start of your conversation.</p>
        </div>

        <div
          v-for="m in view === 'server' ? serverMessages : dmMessages"
          :key="m.id"
          class="message"
        >
          <div class="message__avatar">{{ m.user[0] }}</div>
          <div class="message__body">
            <div class="message__meta">
              <span class="message__name">{{ m.user }}</span>
              <span class="message__time">{{ m.time }}</span>
            </div>
            <div v-if="m.text" class="message__text">{{ m.text }}</div>
            <img v-if="m.media" :src="m.media" class="message__media" alt="" />
            <div v-if="m.attachments?.length" class="message__attachments">
              <a
                v-for="attachment in m.attachments"
                :key="attachment.id"
                class="message__attachment"
                :href="attachment.url"
                :download="attachment.fileName"
                target="_blank"
                rel="noreferrer"
              >
                &#128206; {{ attachment.fileName }}
              </a>
            </div>
          </div>
        </div>
      </section>
    </section>

    <section v-else ref="chatScroller" class="chat">
      <div v-if="contentLoading" class="chat__loading">Refreshing conversation...</div>
      <div v-if="showIncomingCall && callStatus === 'incoming' && !showCallStage" class="call-banner">
        <div>
          <div class="call-banner__title">Incoming voice call</div>
          <div class="call-banner__subtitle">{{ incomingCall?.fromUsername || dmTitle }} is calling.</div>
        </div>
        <div class="call-banner__actions">
          <button class="auth-submit" @click="acceptCall">Accept</button>
          <button class="auth-toggle__btn" @click="declineCall">Decline</button>
        </div>
      </div>

      <div class="chat__intro">
        <div class="chat__badge">{{ new Date().toLocaleDateString() }}</div>
        <h1 class="chat__title">
          {{ view === "server" ? serverChannelName : dmTitle }}
        </h1>
        <p class="chat__subtitle">This is the start of your conversation.</p>
      </div>

      <div
        v-for="m in view === 'server' ? serverMessages : dmMessages"
        :key="m.id"
        class="message"
      >
        <div class="message__avatar">{{ m.user[0] }}</div>
        <div class="message__body">
          <div class="message__meta">
            <span class="message__name">{{ m.user }}</span>
            <span class="message__time">{{ m.time }}</span>
          </div>
          <div v-if="m.text" class="message__text">{{ m.text }}</div>
          <img v-if="m.media" :src="m.media" class="message__media" alt="" />
          <div v-if="m.attachments?.length" class="message__attachments">
            <a
              v-for="attachment in m.attachments"
              :key="attachment.id"
              class="message__attachment"
              :href="attachment.url"
              :download="attachment.fileName"
              target="_blank"
              rel="noreferrer"
            >
              &#128206; {{ attachment.fileName }}
            </a>
          </div>
        </div>
      </div>
    </section>

    <footer v-if="!isFriendsHub" class="composer">
      <input
        ref="fileInput"
        class="composer__file-input"
        type="file"
        multiple
        @change="handleFileSelection"
      />
      <button class="composer__add" title="Add files" @click="openFilePicker">+</button>
      <input
        ref="draftInput"
        v-model="draft"
        class="composer__input"
        type="text"
        :placeholder="
          view === 'server' ? `Message #${serverChannelName}` : `Message ${dmTitle}`
        "
        @keydown.enter.prevent="submitMessage"
      />
      <div class="composer__actions">
        <div v-if="queuedFiles.length" class="composer__files">
          <button
            v-for="(file, index) in queuedFiles"
            :key="`${file.name}-${file.size}-${index}`"
            class="composer__file-chip"
            @click="removeQueuedFile(index)"
          >
            &#128206; {{ file.name }}
          </button>
        </div>
        <button class="icon-btn" title="GIF">&#127909;</button>
        <div ref="emojiPicker" class="emoji-picker">
          <button
            class="icon-btn"
            :class="{ 'icon-btn--active': isEmojiPickerOpen }"
            title="Emoji"
            @click.stop="toggleEmojiPicker"
          >
            &#128522;
          </button>
          <div v-if="isEmojiPickerOpen" class="emoji-picker__panel">
            <button
              v-for="emoji in emojis"
              :key="emoji"
              class="emoji-picker__item"
              @click.stop="insertEmoji(emoji)"
            >
              {{ emoji }}
            </button>
          </div>
        </div>
        <button class="icon-btn" title="Gift">&#127873;</button>
        <button class="icon-btn" title="Send" @click="submitMessage">&#128228;</button>
      </div>
    </footer>
  </main>
</template>
