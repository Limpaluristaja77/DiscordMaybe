<script setup>
import { computed, nextTick, ref, watch } from "vue"

const draft = ref("")
const chatScroller = ref(null)
const fileInput = ref(null)
const queuedFiles = ref([])

const props = defineProps({
  sendMessage: { type: Function, required: true },
  view: { type: String, required: true },
  serverMessages: { type: Array, required: true },
  dmMessages: { type: Array, required: true },
  serverChannelName: { type: String, required: true },
  dmTitle: { type: String, required: true },
})

const activeMessages = computed(() =>
  props.view === "server" ? props.serverMessages : props.dmMessages
)

async function scrollToBottom() {
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

watch(
  () => activeMessages.value.length,
  () => {
    scrollToBottom()
  },
  { immediate: true }
)
</script>

<template>
  <main class="main">
    <header class="main__header">
      <div class="channel-title">
        <span class="channel-title__hash">
          {{ view === "server" ? "#" : "DM" }}
        </span>
        <span>{{ view === "server" ? serverChannelName : dmTitle }}</span>
      </div>
      <div class="header__actions">
        <button class="icon-btn" title="Call">&#128222;</button>
        <button class="icon-btn" title="Video">&#128249;</button>
        <button class="icon-btn" title="Pins">&#128204;</button>
        <button class="icon-btn" title="Members">&#128101;</button>
        <button class="icon-btn" title="Search">&#128270;</button>
      </div>
    </header>

    <section ref="chatScroller" class="chat">
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

    <footer class="composer">
      <input
        ref="fileInput"
        class="composer__file-input"
        type="file"
        multiple
        @change="handleFileSelection"
      />
      <button class="composer__add" title="Add files" @click="openFilePicker">+</button>
      <input
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
        <button class="icon-btn" title="Emoji">&#128522;</button>
        <button class="icon-btn" title="Gift">&#127873;</button>
        <button class="icon-btn" title="Send" @click="submitMessage">&#128228;</button>
      </div>
    </footer>
  </main>
</template>
