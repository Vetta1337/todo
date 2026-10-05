import { ref, computed, nextTick, watch } from "vue";
import { db, ui, projectRegister, createIssue, openIssue } from "../store.js";
import Select from "./Select.js";

export default {
  components: { Select },
  props: { open: Boolean },
  emits: ["close"],
  setup(props, { emit }) {
    const title = ref("");
    const description = ref("");
    const customerId = ref("");
    const projectId = ref("");
    const status = ref("inbox");
    const priority = ref("medium");
    const titleInput = ref(null);

    const customerOptions = computed(() => [
      { value: "", label: "No customer" },
      ...db.customers.map((c) => ({ value: c.id, label: c.name }))
    ]);
    const projectOptions = computed(() => [
      { value: "", label: "No project" },
      ...db.projects.filter((p) => projectRegister(p) === ui.register).map((p) => ({ value: p.id, label: p.name }))
    ]);
    const statusOptions = computed(() => db.statuses.map((s) => ({ value: s.key, label: s.label })));
    const priorityOptions = computed(() => db.priorities.map((p) => ({ value: p.key, label: p.label })));

    function reset() {
      title.value = ""; description.value = ""; customerId.value = ""; projectId.value = "";
      status.value = "inbox"; priority.value = "medium";
    }
    watch(projectId, (pid) => {
      const p = db.projects.find((p) => p.id === pid);
      if (p && p.customerId) customerId.value = p.customerId;
    });
    async function submit() {
      const titles = title.value.split("|").map((t) => t.trim()).filter(Boolean);
      if (!titles.length) return;
      const desc = description.value.trim();
      const cid = customerId.value || null;
      const pid = projectId.value || null;
      let firstIssue = null;
      for (const t of titles) {
        const issue = await createIssue({ title: t, description: desc, customerId: cid, projectId: pid, status: status.value, priority: priority.value, register: ui.register });
        if (!firstIssue) firstIssue = issue;
      }
      reset();
      emit("close");
      openIssue(firstIssue.id);
    }
    function focusTitle() {
      nextTick(() => { if (titleInput.value) titleInput.value.focus(); });
    }
    return {
      db, ui, title, description, customerId, projectId, status, priority, titleInput,
      customerOptions, projectOptions, statusOptions, priorityOptions, submit, focusTitle
    };
  },
  watch: {
    open(v) { if (v) this.focusTitle(); }
  },
  template: `
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="fixed inset-0 bg-black/55 z-[60] flex items-start justify-center pt-[14vh]" @click.self="$emit('close')">
        <div class="modal-card shadow-modal bg-panel border border-bstrong rounded-xl w-[440px] max-w-[92vw] p-[18px]">
          <h2 class="text-sm font-semibold mb-3.5 tracking-tight">New {{ ui.register }} issue</h2>
          <div class="mb-3.5">
            <input ref="titleInput" v-model="title" placeholder="Title (use | to add multiple)" @keydown.enter="submit">
          </div>
          <div class="mb-3.5">
            <textarea v-model="description" placeholder="Description (optional)" rows="3"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-2.5 mb-2.5">
            <Select v-model="status" :options="statusOptions" />
            <Select v-model="priority" :options="priorityOptions" />
          </div>
          <div class="grid grid-cols-2 gap-2.5">
            <Select v-model="customerId" :options="customerOptions" />
            <Select v-model="projectId" :options="projectOptions" />
          </div>
          <div class="flex justify-end gap-2 mt-4">
            <button @click="$emit('close')" class="bg-surface2 border border-border px-3 py-1.5 rounded-md hover:border-bstrong">Cancel</button>
            <button @click="submit" class="bg-accent border-accent text-white px-3 py-1.5 rounded-md hover:bg-[#3f6bef] shadow-pop">Create</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
  `
};
