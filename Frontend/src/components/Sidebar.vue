<script setup>
defineProps({
  view: { type: String, required: true },
  serverChannels: { type: Array, required: true },
  dmList: { type: Array, required: true },
})
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar__header">
      <div class="guild">
        <div class="guild__name">
          {{ view === "server" ? "Server Name" : "Direct Messages" }}
        </div>
        <div class="guild__meta">
          {{ view === "server" ? "GENERAL" : "Find or start a conversation..." }}
        </div>
      </div>
      <button class="icon-btn">+</button>
    </div>

    <div v-if="view === 'dm'" class="sidebar__section">
      <button class="sidebar__pill">Find or start a conversation...</button>
      <div class="dm-shortcuts">
        <button class="dm-shortcuts__item">Friends</button>
        <button class="dm-shortcuts__item">Nitro</button>
        <button class="dm-shortcuts__item">Shop</button>
        <button class="dm-shortcuts__item">Quests</button>
      </div>
      <div class="section__title">Direct Messages</div>
      <button v-for="dm in dmList" :key="dm.id" class="dm-row" :class="{ active: dm.active }">
        <span class="dm-row__avatar">{{ dm.name[0] }}</span>
        <span class="dm-row__info">
          <span class="dm-row__name">{{ dm.name }}</span>
          <span class="dm-row__sub">{{ dm.subtitle }}</span>
        </span>
      </button>
    </div>

    <div v-else class="sidebar__section">
      <div class="section__title">GENERAL</div>
      <button
        v-for="c in serverChannels"
        :key="c.id"
        class="channel"
        :class="{ active: c.active }"
      >
        <span class="channel__hash">#</span>
        <span class="channel__name">{{ c.name }}</span>
        <span v-if="c.unread" class="channel__pill">{{ c.unread }}</span>
      </button>
    </div>

    <div class="sidebar__footer">
      <div class="user">
        <div class="user__avatar">A</div>
        <div class="user__info">
          <div class="user__name">andri</div>
          <div class="user__tag">@andri</div>
        </div>
      </div>
      <div class="user__actions">
        <button class="icon-btn">MIC</button>
        <button class="icon-btn">HP</button>
        <button class="icon-btn">SET</button>
      </div>
    </div>
  </aside>
</template>
