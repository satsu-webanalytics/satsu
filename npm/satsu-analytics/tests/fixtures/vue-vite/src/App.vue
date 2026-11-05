<script setup lang="ts">
import { ref } from "vue";
import HelloWorld from "./components/HelloWorld.vue";

const count = ref(0);
</script>

<template>
  <main>
    <HelloWorld msg="Vite + Vue" />
    <button @click="count++">{{ count }}</button>
  </main>
</template>

<style scoped>
main {
  padding: 1rem;
}
</style>
