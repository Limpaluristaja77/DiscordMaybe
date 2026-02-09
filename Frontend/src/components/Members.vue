<script setup>
defineProps({
  view: { type: String, required: true },
  serverMembers: { type: Array, required: true },
  dmMembers: { type: Array, required: true },
})
</script>

<template>
  <aside class="members">
    <div class="members__header">
      {{ view === "server" ? "Members - 9" : "Members - 3" }}
    </div>
    <div
      v-for="m in view === 'server' ? serverMembers : dmMembers"
      :key="m.id"
      class="member"
      :data-tone="m.status"
    >
      <div class="member__avatar">{{ m.name[0] }}</div>
      <div class="member__info">
        <div class="member__name">{{ m.name }}</div>
        <div class="member__status">{{ m.role || m.status }}</div>
      </div>
    </div>
  </aside>
</template>
