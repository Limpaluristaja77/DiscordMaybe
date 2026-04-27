<script setup>
defineProps({
  guilds: { type: Array, required: true },
  view: { type: String, required: true },
  activeGuildId: { type: String, default: null },
})

const emit = defineEmits(["set-view", "select-guild", "create-server"])
</script>

<template>
  <aside class="rail">
    <button class="rail__logo" :class="{ active: view === 'dm' }" @click="emit('set-view', 'dm')">
      DM
    </button>
    <button
      v-for="g in guilds"
      :key="g.id"
      class="rail__btn"
      :class="{ active: activeGuildId === g.id && view === 'server' }"
      :title="g.name"
      @click="emit('select-guild', g.id)"
    >
      {{ g.abbr }}
      <span v-if="g.badge" class="rail__badge">{{ g.badge }}</span>
    </button>
    <div class="rail__divider"></div>
    <button class="rail__btn rail__btn--ghost" title="Create server" @click="emit('create-server')">
      +
    </button>
  </aside>
</template>
