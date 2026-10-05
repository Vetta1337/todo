import { ref, computed, onMounted, onUnmounted } from "vue";

export default {
  props: {
    modelValue: { default: null },
    options: { type: Array, required: true }, // [{ value, label }]
    size: { type: String, default: "" } // "sm" for compact filter/inline selects
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const open = ref(false);
    const root = ref(null);
    const current = computed(() =>
      props.options.find((o) => o.value === props.modelValue) || props.options[0]
    );
    function toggle() { open.value = !open.value; }
    function choose(opt) {
      emit("update:modelValue", opt.value);
      open.value = false;
    }
    function onDocClick(e) {
      if (root.value && !root.value.contains(e.target)) open.value = false;
    }
    function onKeydown(e) {
      if (e.key === "Escape") open.value = false;
    }
    onMounted(() => {
      document.addEventListener("click", onDocClick);
      document.addEventListener("keydown", onKeydown);
    });
    onUnmounted(() => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeydown);
    });
    return { open, root, current, toggle, choose };
  },
  template: `
  <div ref="root" class="relative inline-block w-full">
    <button type="button" @click.stop="toggle"
            class="w-full flex items-center justify-between gap-2 bg-surface2 border border-border rounded-md text-left cursor-pointer hover:border-bstrong transition-colors"
            :class="size==='sm' ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2'">
      <span class="overflow-hidden text-ellipsis whitespace-nowrap">{{ current ? current.label : '' }}</span>
      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" class="flex-none text-dim transition-transform" :style="{ transform: open ? 'rotate(180deg)' : 'none' }">
        <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <Transition name="fade">
      <div v-if="open" class="absolute z-50 mt-1 min-w-full w-max max-h-64 overflow-y-auto bg-surface2 border border-bstrong rounded-md shadow-pop py-1">
        <div v-for="opt in options" :key="String(opt.value)" @click.stop="choose(opt)"
             class="px-3 py-1.5 text-[12px] cursor-pointer whitespace-nowrap flex items-center justify-between gap-3"
             :class="opt.value === modelValue ? 'bg-accentdim text-text' : 'text-dim hover:bg-surface hover:text-text'">
          <span>{{ opt.label }}</span>
          <svg v-if="opt.value === modelValue" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4f7cff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="flex-none"><path d="M20 6 9 17l-5-5"/></svg>
        </div>
      </div>
    </Transition>
  </div>
  `
};
