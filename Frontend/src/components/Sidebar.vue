<script setup>
defineProps({
  view: { type: String, required: true },
  dmSection: { type: String, required: true },
  serverChannels: { type: Array, required: true },
  dmList: { type: Array, required: true },
  activeGuildName: { type: String, required: true },
  currentUser: { type: Object, required: true },
  serverChannelName: { type: String, required: true },
  friendCount: { type: Number, required: true },
  requestCount: { type: Number, required: true },
})

const emit = defineEmits([
  "logout",
  "select-server-channel",
  "select-dm",
  "open-create-channel",
  "set-dm-section",
])
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar__header">
      <div class="guild">
        <div class="guild__name">
          {{ view === "server" ? activeGuildName : "Direct Messages" }}
        </div>
        <div class="guild__meta">
          {{
            view === "server"
              ? serverChannelName.toUpperCase()
              : dmSection === "friends"
                ? `${friendCount} friends • ${requestCount} pending`
                : "Open a conversation with a friend"
          }}
        </div>
      </div>
      <button
        class="icon-btn"
        :title="view === 'server' ? 'Add channel' : 'Friends home'"
        @click="view === 'server' ? emit('open-create-channel') : emit('set-dm-section', 'friends')"
      >
        +
      </button>
    </div>

    <div v-if="view === 'dm'" class="sidebar__section">
      <div class="dm-shortcuts dm-shortcuts--tabs">
        <button
          class="dm-shortcuts__item"
          :class="{ active: dmSection === 'friends' }"
          @click="emit('set-dm-section', 'friends')"
        >
          Friends
          <span v-if="requestCount" class="sidebar__count">{{ requestCount }}</span>
        </button>
        <button
          class="dm-shortcuts__item"
          :class="{ active: dmSection === 'messages' }"
          @click="emit('set-dm-section', 'messages')"
        >
          Messages
          <span v-if="dmList.length" class="sidebar__count">{{ dmList.length }}</span>
        </button>
      </div>
      <div class="section__title">Direct Messages</div>
      <button
        v-for="dm in dmList"
        :key="dm.id"
        class="dm-row"
        :class="{ active: dm.active && dmSection === 'messages' }"
        @click="emit('select-dm', dm.id)"
      >
        <span class="dm-row__avatar">{{ dm.name[0] }}</span>
        <span class="dm-row__info">
          <span class="dm-row__name">{{ dm.name }}</span>
          <span class="dm-row__sub">{{ dm.subtitle }}</span>
        </span>
      </button>
      <div v-if="!dmList.length" class="sidebar__empty">
        Accepted friends will show up here once you start a direct message.
      </div>
    </div>

    <div v-else class="sidebar__section">
      <div class="section__title">GENERAL</div>
      <button
        v-for="c in serverChannels"
        :key="c.id"
        class="channel"
        :class="{ active: c.active }"
        @click="emit('select-server-channel', c.id)"
      >
        <span class="channel__hash">#</span>
        <span class="channel__name">{{ c.name }}</span>
        <span v-if="c.unread" class="channel__pill">{{ c.unread }}</span>
      </button>
    </div>

    <div class="sidebar__footer">
      <div class="user">
        <div class="user__avatar">{{ currentUser.username[0] }}</div>
        <div class="user__info">
          <div class="user__name">{{ currentUser.username }}</div>
          <div class="user__tag">{{ currentUser.tag }}</div>
        </div>
      </div>
      <div class="user__actions">
        <button class="icon-btn" title="Microphone">&#127897;</button>
        <button class="icon-btn" title="Headphones">&#127911;</button>
        <button class="icon-btn" title="Settings">&#9881;</button>
        <button class="icon-btn" title="Logout" @click="emit('logout')">&#128682;</button>
      </div>
    </div>
  </aside>
</template>
