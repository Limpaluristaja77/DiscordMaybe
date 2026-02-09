<script setup>
import { ref } from "vue"
import Rail from "./components/Rail.vue"
import Sidebar from "./components/Sidebar.vue"
import ChatMain from "./components/ChatMain.vue"
import Members from "./components/Members.vue"

const view = ref("server")

const guilds = [
  { id: "g1", abbr: "S1", badge: 0 },
  { id: "g2", abbr: "S2", badge: 6 },
  { id: "g3", abbr: "S3", badge: 0 },
  { id: "g4", abbr: "S4", badge: 10 },
  { id: "g5", abbr: "S5", badge: 0 },
  { id: "g6", abbr: "S6", badge: 15 },
]

const serverChannels = [
  { id: "s1", name: "general", unread: 0, active: true },
  { id: "s2", name: "announcements", unread: 0 },
  { id: "s3", name: "game-discussion", unread: 0 },
  { id: "s4", name: "fan-art", unread: 0 },
  { id: "s5", name: "content", unread: 0 },
  { id: "s6", name: "suggestions", unread: 0 },
  { id: "s7", name: "support", unread: 0 },
  { id: "s8", name: "class-chat", unread: 0 },
]

const dmList = [
  { id: "dm1", name: "User One", subtitle: "Online", status: "online" },
  { id: "dm2", name: "Group Chat", subtitle: "3 Members", active: true },
  { id: "dm3", name: "User Two", subtitle: "", status: "idle" },
  { id: "dm4", name: "User Three", subtitle: "3 Members" },
  { id: "dm5", name: "User Four", subtitle: "5 Members" },
  { id: "dm6", name: "User Five", subtitle: "", status: "offline" },
]

const serverMessages = [
  {
    id: 1,
    user: "User One",
    time: "8:47 AM",
    text: "Message sample one.",
  },
  {
    id: 2,
    user: "User Two",
    time: "8:47 AM",
    text: "Message sample two.",
  },
  {
    id: 3,
    user: "User Three",
    time: "8:47 AM",
    text: "Message sample three.",
  },
]

const dmMessages = [
  {
    id: 1,
    user: "User One",
    time: "9:05 AM",
    text: "media item",
    media: "https://i.ytimg.com/vi/9HksRmJGWcY/hq720.jpg?sqp=-oaymwEhCK4FEIIDSFryq4qpAxMIARUAAAAAGAElAADIQj0AgKJD&rs=AOn4CLCfC1KPdkxvx6ftkYDsbNw5pnsD-Q",
  },
]

const serverMembers = [
  { id: "m1", name: "Member One", role: "Moderator", status: "online" },
  { id: "m2", name: "Member Two", role: "Support", status: "online" },
  { id: "m3", name: "Member Three", role: "Guide", status: "online" },
  { id: "m4", name: "Member Four", role: "", status: "online" },
  { id: "m5", name: "Member Five", role: "Contributor", status: "idle" },
  { id: "m6", name: "Member Six", role: "Support", status: "idle" },
  { id: "m7", name: "Member Seven", role: "Support", status: "idle" },
  { id: "m8", name: "Member Eight", role: "Support", status: "idle" },
  { id: "m9", name: "Member Nine", role: "Support", status: "idle" },
]

const dmMembers = [
  { id: "d1", name: "Member A", status: "offline" },
  { id: "d2", name: "Member B", status: "idle" },
  { id: "d3", name: "Member C", status: "online" },
]
</script>

<template>
  <div class="app">
    <Rail :guilds="guilds" :view="view" @set-view="view = $event" />
    <Sidebar :view="view" :server-channels="serverChannels" :dm-list="dmList" />
    <ChatMain :view="view" :server-messages="serverMessages" :dm-messages="dmMessages" />
    <Members :view="view" :server-members="serverMembers" :dm-members="dmMembers" />
  </div>
</template>
