import { toast, runToastAction, dismissToast } from "../store.js";

export default {
  setup() {
    return { toast, runToastAction, dismissToast };
  },
  template: `
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="toast.visible"
           class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-panel border border-bstrong shadow-modal rounded-lg px-4 py-3 flex items-center gap-3 text-[12px]">
        <span>{{ toast.message }}</span>
        <button v-if="toast.actionLabel" @click="runToastAction"
                class="text-accent font-semibold bg-transparent border-none px-1 hover:underline">{{ toast.actionLabel }}</button>
        <button @click="dismissToast" class="bg-transparent border-none text-dim hover:text-text px-1">✕</button>
      </div>
    </Transition>
  </Teleport>
  `
};
