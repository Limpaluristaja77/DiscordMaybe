<script setup>
defineProps({
  guilds: { type: Array, required: true },
  view: { type: String, required: true },
})

const emit = defineEmits(["set-view"])
</script>

<template>
  <aside class="rail">
    <button class="rail__logo" @click="emit('set-view', 'dm')">DM</button>
    <button
      v-for="g in guilds"
      :key="g.id"
      class="rail__btn"
      @click="emit('set-view', 'server')"
    >
      {{ g.abbr }}
      <span v-if="g.badge" class="rail__badge">{{ g.badge }}</span>
    </button>
    <div class="rail__divider"></div>
    <button class="rail__btn rail__btn--ghost">+</button>
  </aside>
</template>
