<script setup>
import { reactive } from "vue"
import AuthPanel from "./components/AuthPanel.vue"
import ChatMain from "./components/ChatMain.vue"
import Members from "./components/Members.vue"
import Rail from "./components/Rail.vue"
import Sidebar from "./components/Sidebar.vue"
import { useDiscordApp } from "./composables/useDiscordApp"

const app = reactive(useDiscordApp())
</script>

<template>
  <div v-if="app.loading" class="app app--status">Loading data...</div>
  <AuthPanel v-else-if="!app.isAuthenticated" :authenticate="app.handleAuthenticate" />
  <div v-else-if="app.error && !app.bootstrap" class="app app--status">
    Failed to load: {{ app.error }}
  </div>
  <div v-else class="app">
    <Rail
      :guilds="app.guilds"
      :view="app.view"
      :active-guild-id="app.activeGuildId"
      @set-view="app.setView"
      @select-guild="app.handleSelectGuild"
      @create-server="app.openCreateServer"
    />
    <Sidebar
      :view="app.view"
      :dm-section="app.dmSection"
      :server-channels="app.serverChannels"
      :dm-list="app.dmList"
      :active-guild-name="app.activeGuildName"
      :current-user="app.currentUser"
      :server-channel-name="app.serverChannelName"
      :friend-count="app.friends.length"
      :request-count="app.incomingFriendRequests.length"
      :unread-dm-count="app.unreadDmCount"
      :unread-server-count="app.unreadServerCount"
      @logout="app.handleLogout"
      @set-dm-section="app.setDmSection"
      @open-create-channel="app.openCreateChannel"
      @select-server-channel="app.handleSelectServerChannel"
      @select-dm="app.handleSelectDm"
    />
    <ChatMain
      :send-message="app.handleSendMessage"
      :send-friend-request="app.handleSendFriendRequest"
      :accept-friend-request="app.handleAcceptFriendRequest"
      :open-dm-with-friend="app.handleOpenDmWithFriend"
      :start-call="app.handleStartCall"
      :accept-call="app.acceptCall"
      :decline-call="app.declineCall"
      :end-call="app.endCall"
      :toggle-mute="app.toggleMute"
      :view="app.view"
      :dm-section="app.dmSection"
      :server-messages="app.serverMessages"
      :dm-messages="app.dmMessages"
      :server-channel-name="app.serverChannelName"
      :dm-title="app.dmTitle"
      :friends="app.friends"
      :incoming-friend-requests="app.incomingFriendRequests"
      :outgoing-friend-requests="app.outgoingFriendRequests"
      :error="app.error"
      :call-error="app.callError"
      :call-status="app.callStatus"
      :call-thread-id="app.callThreadId"
      :active-dm-thread-id="app.activeDmThreadId"
      :incoming-call="app.incomingCall"
      :call-muted="app.callMuted"
      :current-user="app.currentUser"
      :content-loading="app.contentLoading"
    />
    <Members
      :view="app.view"
      :dm-section="app.dmSection"
      :server-members="app.serverMembers"
      :dm-members="app.dmMembers"
      :friends="app.friends"
      :incoming-friend-requests="app.incomingFriendRequests"
    />
    <div
      v-if="app.isCreateServerOpen"
      class="modal-shell"
      @click.self="app.closeCreateServer"
    >
      <div class="modal-card">
        <div class="modal-card__header">
          <div>
            <div class="modal-card__eyebrow">Create</div>
            <h2 class="modal-card__title">New Server</h2>
          </div>
          <button class="icon-btn" title="Close" @click="app.closeCreateServer">&#10005;</button>
        </div>
        <p class="modal-card__copy">Pick a name and we'll set up starter channels for you.</p>
        <input
          v-model="app.createServerName"
          class="auth-input"
          type="text"
          maxlength="40"
          placeholder="Server name"
          @keydown.enter.prevent="app.handleCreateServer"
        />
        <div class="modal-card__actions">
          <button
            class="auth-toggle__btn"
            :disabled="app.creatingServer"
            @click="app.closeCreateServer"
          >
            Cancel
          </button>
          <button class="auth-submit" :disabled="app.creatingServer" @click="app.handleCreateServer">
            {{ app.creatingServer ? "Creating..." : "Create Server" }}
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="app.isCreateChannelOpen"
      class="modal-shell"
      @click.self="app.closeCreateChannel"
    >
      <div class="modal-card">
        <div class="modal-card__header">
          <div>
            <div class="modal-card__eyebrow">Create</div>
            <h2 class="modal-card__title">New Channel</h2>
          </div>
          <button class="icon-btn" title="Close" @click="app.closeCreateChannel">&#10005;</button>
        </div>
        <p class="modal-card__copy">Add a text channel to {{ app.activeGuildName }}.</p>
        <input
          v-model="app.createChannelName"
          class="auth-input"
          type="text"
          maxlength="40"
          placeholder="channel-name"
          @keydown.enter.prevent="app.handleCreateChannel"
        />
        <div class="modal-card__actions">
          <button
            class="auth-toggle__btn"
            :disabled="app.creatingChannel"
            @click="app.closeCreateChannel"
          >
            Cancel
          </button>
          <button class="auth-submit" :disabled="app.creatingChannel" @click="app.handleCreateChannel">
            {{ app.creatingChannel ? "Creating..." : "Create Channel" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
