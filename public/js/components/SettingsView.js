import { ref, computed } from "vue";
import { db, ui, projectRegister, addSettingsItem, deleteSettingsItem, saveSettingsKind, saveIssues } from "../store.js";
import Select from "./Select.js";

const TITLES = { customers: "Customers", projects: "Projects", tags: "Tags", statuses: "Statuses", priorities: "Priorities" };
const PLACEHOLDERS = {
  customers: "New customer name", projects: "New project name", tags: "New tag name",
  statuses: "New status label", priorities: "New priority label"
};

export default {
  components: { Select },
  props: { kind: { type: String, required: true } },
  setup(props) {
    const newName = ref("");
    const listFor = () => ({
      customers: db.customers, projects: db.projects.filter((p) => projectRegister(p) === ui.register), tags: db.tags,
      statuses: db.statuses, priorities: db.priorities
    }[props.kind]);
    const customerOptions = computed(() => [
      { value: null, label: "No customer" },
      ...db.customers.map((c) => ({ value: c.id, label: c.name }))
    ]);

    async function add() {
      if (!newName.value.trim()) return;
      await addSettingsItem(props.kind, newName.value);
      newName.value = "";
    }
    async function remove(id) {
      await deleteSettingsItem(props.kind, id);
    }
    async function onChange() {
      await saveSettingsKind(props.kind);
    }
    async function setProjectCustomer(p, value) {
      p.customerId = value;
      await onChange();
    }
    async function moveProject(p) {
      const target = ui.register === "work" ? "private" : "work";
      p.register = target;
      for (const issue of db.issues) {
        if (issue.projectId === p.id) issue.register = target;
      }
      await Promise.all([saveSettingsKind("projects"), saveIssues()]);
    }

    return { db, ui, newName, TITLES, PLACEHOLDERS, customerOptions, listFor, add, remove, onChange, setProjectCustomer, moveProject };
  },
  template: `
  <h1 class="text-[17px] font-semibold mb-5 tracking-tight">{{ kind === 'projects' ? (ui.register === 'work' ? 'Work projects' : 'Private projects') : TITLES[kind] }}</h1>
  <div class="flex flex-col gap-1.5 max-w-[640px]">

    <template v-if="kind === 'customers'">
      <div v-for="c in db.customers" :key="c.id"
           class="card-elevated flex items-center gap-2.5 bg-surface border border-border rounded-lg px-3.5 py-2.5">
        <input type="text" v-model="c.name" @change="onChange" class="!bg-transparent !border-none flex-1 !p-0.5 !shadow-none">
        <button @click="remove(c.id)" class="bg-transparent border-none px-1.5 py-1 text-dim hover:text-critical">Delete</button>
      </div>
    </template>

    <template v-if="kind === 'projects'">
      <div v-for="p in listFor()" :key="p.id"
           class="card-elevated flex items-center gap-2.5 bg-surface border border-border rounded-lg px-3.5 py-2.5">
        <span class="w-3.5 h-3.5 rounded-full border border-bstrong flex-none" :style="{ background: p.color }"></span>
        <input type="text" v-model="p.name" @change="onChange" class="!bg-transparent !border-none flex-1 !p-0.5 !shadow-none">
        <div class="w-[150px] flex-none"><Select :model-value="p.customerId" @update:model-value="setProjectCustomer(p, $event)" :options="customerOptions" size="sm" /></div>
        <input type="color" v-model="p.color" @change="onChange">
        <label class="flex items-center gap-1 text-[11px] text-dim whitespace-nowrap">
          <input type="checkbox" v-model="p.archived" @change="onChange">Archived
        </label>
        <button @click="moveProject(p)" class="bg-transparent border border-border px-2 py-1 text-dim hover:text-text rounded text-[11px] whitespace-nowrap">Move to {{ ui.register === 'work' ? 'Private' : 'Work' }}</button>
        <button @click="remove(p.id)" class="bg-transparent border-none px-1.5 py-1 text-dim hover:text-critical">Delete</button>
      </div>
    </template>

    <template v-if="kind === 'tags'">
      <div v-for="t in db.tags" :key="t.id"
           class="card-elevated flex items-center gap-2.5 bg-surface border border-border rounded-lg px-3.5 py-2.5">
        <input type="color" v-model="t.color" @change="onChange">
        <input type="text" v-model="t.name" @change="onChange" class="!bg-transparent !border-none flex-1 !p-0.5 !shadow-none">
        <button @click="remove(t.id)" class="bg-transparent border-none px-1.5 py-1 text-dim hover:text-critical">Delete</button>
      </div>
    </template>

    <template v-if="kind === 'statuses'">
      <div v-for="s in db.statuses" :key="s.key"
           class="card-elevated flex items-center gap-2.5 bg-surface border border-border rounded-lg px-3.5 py-2.5">
        <input type="color" v-model="s.color" @change="onChange">
        <input type="text" v-model="s.label" @change="onChange" class="!bg-transparent !border-none flex-1 !p-0.5 !shadow-none">
        <span class="font-mono text-faint text-[11px]">{{ s.key }}</span>
        <button @click="remove(s.key)" class="bg-transparent border-none px-1.5 py-1 text-dim hover:text-critical">Delete</button>
      </div>
    </template>

    <template v-if="kind === 'priorities'">
      <div v-for="p in db.priorities" :key="p.key"
           class="card-elevated flex items-center gap-2.5 bg-surface border border-border rounded-lg px-3.5 py-2.5">
        <input type="color" v-model="p.color" @change="onChange">
        <input type="text" v-model="p.label" @change="onChange" class="!bg-transparent !border-none flex-1 !p-0.5 !shadow-none">
        <span class="font-mono text-faint text-[11px]">{{ p.key }}</span>
        <button @click="remove(p.key)" class="bg-transparent border-none px-1.5 py-1 text-dim hover:text-critical">Delete</button>
      </div>
    </template>

    <div class="flex gap-2 mt-2">
      <input type="text" v-model="newName" :placeholder="PLACEHOLDERS[kind]" @keydown.enter="add">
      <button @click="add" class="bg-accent border-accent text-white px-2.5 py-1.5 rounded-md hover:bg-[#3f6bef]">Add</button>
    </div>
  </div>
  `
};
