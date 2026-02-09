<script setup>
defineProps({
  view: { type: String, required: true },
  serverMessages: { type: Array, required: true },
  dmMessages: { type: Array, required: true },
})
</script>

<template>
  <main class="main">
    <header class="main__header">
      <div class="channel-title">
        <span class="channel-title__hash">
          {{ view === "server" ? "#" : "DM" }}
        </span>
        <span>{{ view === "server" ? "general" : "Direct Message" }}</span>
      </div>
      <div class="header__actions">
        <button class="icon-btn">CALL</button>
        <button class="icon-btn">VID</button>
        <button class="icon-btn">PIN</button>
        <button class="icon-btn">MEM</button>
        <button class="icon-btn">SEARCH</button>
      </div>
    </header>

    <section class="chat">
      <div class="chat__intro">
        <div class="chat__badge">February 9, 2026</div>
        <h1 class="chat__title">
          {{ view === "server" ? "general" : "Direct Messages" }}
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
          <div class="message__text">{{ m.text }}</div>
          <img v-if="m.media" :src="m.media" class="message__media" alt="" />
        </div>
      </div>
    </section>

    <footer class="composer">
      <button class="composer__add">+</button>
      <input
        class="composer__input"
        type="text"
        :placeholder="view === 'server' ? 'Message #general' : 'Message Direct Messages'"
      />
      <div class="composer__actions">
        <button class="icon-btn">GIF</button>
        <button class="icon-btn">EMJ</button>
        <button class="icon-btn">GIFT</button>
      </div>
    </footer>
  </main>
</template>
