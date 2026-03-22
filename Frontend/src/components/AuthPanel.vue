<script setup>
import { computed, ref } from "vue"

const props = defineProps({
  authenticate: { type: Function, required: true },
})

const mode = ref("login")
const username = ref("")
const email = ref("")
const emailOrUsername = ref("")
const password = ref("")
const error = ref("")
const busy = ref(false)

const submitLabel = computed(() => (mode.value === "login" ? "Login" : "Register"))

async function submit() {
  busy.value = true
  error.value = ""

  try {
    const payload =
      mode.value === "login"
        ? {
            emailOrUsername: emailOrUsername.value,
            password: password.value,
          }
        : {
            username: username.value,
            email: email.value,
            password: password.value,
          }

    await props.authenticate({
      mode: mode.value,
      payload,
    })

    username.value = ""
    email.value = ""
    emailOrUsername.value = ""
    password.value = ""
  } catch (submitError) {
    error.value = submitError.message || "Authentication failed"
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth-shell">
    <section class="auth-card">
      <div class="auth-card__badge">DiscordMaybe</div>
      <h1 class="auth-card__title">
        {{ mode === "login" ? "Welcome back" : "Create your account" }}
      </h1>
      <p class="auth-card__subtitle">
        {{ mode === "login" ? "Sign in to open your chats." : "Register to join the server and start chatting." }}
      </p>

      <div class="auth-toggle">
        <button
          class="auth-toggle__btn"
          :class="{ active: mode === 'login' }"
          @click="mode = 'login'"
        >
          Login
        </button>
        <button
          class="auth-toggle__btn"
          :class="{ active: mode === 'register' }"
          @click="mode = 'register'"
        >
          Register
        </button>
      </div>

      <form class="auth-form" @submit.prevent="submit">
        <input
          v-if="mode === 'register'"
          v-model="username"
          class="auth-input"
          type="text"
          placeholder="Username"
          autocomplete="username"
        />
        <input
          v-if="mode === 'register'"
          v-model="email"
          class="auth-input"
          type="email"
          placeholder="Email"
          autocomplete="email"
        />
        <input
          v-if="mode === 'login'"
          v-model="emailOrUsername"
          class="auth-input"
          type="text"
          placeholder="Email or username"
          autocomplete="username"
        />
        <input
          v-model="password"
          class="auth-input"
          type="password"
          placeholder="Password"
          autocomplete="current-password"
        />
        <button class="auth-submit" type="submit" :disabled="busy">
          {{ busy ? "Working..." : submitLabel }}
        </button>
        <p v-if="error" class="auth-error">{{ error }}</p>
      </form>
    </section>
  </div>
</template>
