<script setup>
import { computed, onMounted, ref } from "vue"
import Rail from "./components/Rail.vue"
import Sidebar from "./components/Sidebar.vue"
import ChatMain from "./components/ChatMain.vue"
import Members from "./components/Members.vue"

const view = ref("server")
const bootstrap = ref(null)
const loading = ref(true)
const error = ref("")

const guilds = computed(() => bootstrap.value?.guilds || [])
const serverChannels = computed(() => bootstrap.value?.serverChannels || [])
const dmList = computed(() => bootstrap.value?.dmList || [])
const serverMessages = computed(() => bootstrap.value?.serverMessages || [])
const dmMessages = computed(() => bootstrap.value?.dmMessages || [])
const serverMembers = computed(() => bootstrap.value?.serverMembers || [])
const dmMembers = computed(() => bootstrap.value?.dmMembers || [])
const activeGuildName = computed(() => bootstrap.value?.activeGuildName || "Server")
const dmTitle = computed(() => bootstrap.value?.dmTitle || "Direct Messages")
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

async function loadBootstrap() {
  loading.value = true
  error.value = ""

  try {
    const response = await fetch("/api/bootstrap")
    if (!response.ok) {
      throw new Error(`Failed to fetch data (${response.status})`)
    }

    bootstrap.value = await response.json()
  } catch (fetchError) {
    error.value = fetchError.message
  } finally {
    loading.value = false
  }
}

onMounted(loadBootstrap)
</script>

<template>
  <div v-if="loading" class="app">Loading data...</div>
  <div v-else-if="error" class="app">Failed to load: {{ error }}</div>
  <div v-else class="app">
    <Rail :guilds="guilds" :view="view" @set-view="view = $event" />
    <Sidebar
      :view="view"
      :server-channels="serverChannels"
      :dm-list="dmList"
      :active-guild-name="activeGuildName"
      :current-user="currentUser"
      :server-channel-name="serverChannelName"
    />
    <ChatMain
      :view="view"
      :server-messages="serverMessages"
      :dm-messages="dmMessages"
      :server-channel-name="serverChannelName"
      :dm-title="dmTitle"
    />
    <Members :view="view" :server-members="serverMembers" :dm-members="dmMembers" />
  </div>
</template>
