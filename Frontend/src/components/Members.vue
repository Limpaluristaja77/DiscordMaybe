<script setup>
defineProps({
  view: { type: String, required: true },
  dmSection: { type: String, required: true },
  serverMembers: { type: Array, required: true },
  dmMembers: { type: Array, required: true },
  friends: { type: Array, required: true },
  incomingFriendRequests: { type: Array, required: true },
})
</script>

<template>
  <aside class="members">
    <template v-if="view === 'dm' && dmSection === 'friends'">
      <div class="members__header">Friends Overview</div>
      <div class="members__stat-card">
        <div class="members__stat-label">Accepted Friends</div>
        <div class="members__stat-value">{{ friends.length }}</div>
      </div>
      <div class="members__stat-card">
        <div class="members__stat-label">Pending Requests</div>
        <div class="members__stat-value">{{ incomingFriendRequests.length }}</div>
      </div>
      <div class="section__title">Recently Added</div>
      <div v-if="friends.length">
        <div v-for="friend in friends.slice(0, 5)" :key="friend.id" class="member" :data-tone="friend.status">
          <div class="member__avatar">{{ friend.username[0] }}</div>
          <div class="member__info">
            <div class="member__name">{{ friend.username }}</div>
            <div class="member__status">{{ friend.tag }}</div>
          </div>
        </div>
      </div>
      <div v-else class="members__empty">No friends yet.</div>
    </template>

    <template v-else>
      <div class="members__header">
        {{
          view === "server"
            ? `Members - ${serverMembers.length}`
            : `Members - ${dmMembers.length}`
        }}
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
    </template>
  </aside>
</template>
