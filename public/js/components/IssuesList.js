import { computed, ref, watch } from "vue";
import { db, ui, projectRegister, filteredIssues, updateIssue, deleteIssues } from "../store.js";
import IssueRow from "./IssueRow.js";
import Select from "./Select.js";

const SORT_OPTIONS = [
  { value: "updated", label: "Last updated" },
  { value: "created", label: "Date created" },
  { value: "priority", label: "Priority" },
  { value: "dueDate", label: "Due date" },
  { value: "title", label: "Title" }
];

export default {
  components: { IssueRow, Select },
  setup() {
    const list = computed(filteredIssues);
    const selected = ref(new Set());
    const customerOptions = computed(() => [
      { value: "", label: "All customers" },
      ...db.customers.map((c) => ({ value: c.id, label: c.name }))
    ]);
    const projectOptions = computed(() => [
      { value: "", label: "All projects" },
      ...db.projects.filter((p) => projectRegister(p) === ui.register).map((p) => ({ value: p.id, label: p.name }))
    ]);
    const statusOptions = computed(() => [
      { value: "", label: "All statuses" },
      ...db.statuses.map((s) => ({ value: s.key, label: s.label }))
    ]);
    const priorityOptions = computed(() => [
      { value: "", label: "All priorities" },
      ...db.priorities.map((p) => ({ value: p.key, label: p.label }))
    ]);
    const bulkStatusOptions = computed(() => [
      { value: "", label: "Set status..." },
      ...db.statuses.map((s) => ({ value: s.key, label: s.label }))
    ]);
    const bulkPriorityOptions = computed(() => [
      { value: "", label: "Set priority..." },
      ...db.priorities.map((p) => ({ value: p.key, label: p.label }))
    ]);
    function clearFilters() {
      ui.filters = { customer: "", project: "", status: "", priority: "", dueToday: false, waiting: false, overdue: false, hideDone: true };
    }
    function toggleSelect(id) {
      const s = new Set(selected.value);
      if (s.has(id)) s.delete(id); else s.add(id);
      selected.value = s;
    }
    function clearSelection() {
      selected.value = new Set();
    }
    watch(() => ui.register, clearSelection);
    function bulkSetStatus(key) {
      if (!key) return;
      selected.value.forEach((id) => updateIssue(id, { status: key }));
      clearSelection();
    }
    function bulkSetPriority(key) {
      if (!key) return;
      selected.value.forEach((id) => updateIssue(id, { priority: key }));
      clearSelection();
    }
    function bulkDelete() {
      deleteIssues(Array.from(selected.value));
      clearSelection();
    }
    return {
      db, ui, list, selected, customerOptions, projectOptions, statusOptions, priorityOptions,
      bulkStatusOptions, bulkPriorityOptions, SORT_OPTIONS, clearFilters,
      toggleSelect, clearSelection, bulkSetStatus, bulkSetPriority, bulkDelete
    };
  },
  template: `
  <h1 class="text-[17px] font-semibold mb-5 tracking-tight capitalize">{{ ui.register }} issues <span class="text-faint font-mono text-[12px] font-normal">{{ db.issues.filter(i => (i.register || 'work') === ui.register && i.status !== 'done' && i.status !== 'archived').length }} open</span></h1>
  <div class="flex gap-2 flex-wrap items-center mb-4">
    <div class="w-[150px]"><Select v-model="ui.filters.customer" :options="customerOptions" size="sm" /></div>
    <div class="w-[150px]"><Select v-model="ui.filters.project" :options="projectOptions" size="sm" /></div>
    <div class="w-[150px]"><Select v-model="ui.filters.status" :options="statusOptions" size="sm" /></div>
    <div class="w-[140px]"><Select v-model="ui.filters.priority" :options="priorityOptions" size="sm" /></div>
    <span @click="ui.filters.dueToday = !ui.filters.dueToday"
          :class="['text-[11px] px-3 py-1.5 rounded-full border cursor-pointer transition-colors',
                    ui.filters.dueToday ? 'border-accent text-text bg-accentdim' : 'border-border text-dim bg-surface hover:border-bstrong']">Due today</span>
    <span @click="ui.filters.waiting = !ui.filters.waiting"
          :class="['text-[11px] px-3 py-1.5 rounded-full border cursor-pointer transition-colors',
                    ui.filters.waiting ? 'border-accent text-text bg-accentdim' : 'border-border text-dim bg-surface hover:border-bstrong']">Waiting</span>
    <span @click="ui.filters.overdue = !ui.filters.overdue"
          :class="['text-[11px] px-3 py-1.5 rounded-full border cursor-pointer transition-colors',
                    ui.filters.overdue ? 'border-accent text-text bg-accentdim' : 'border-border text-dim bg-surface hover:border-bstrong']">Overdue</span>
    <span @click="ui.filters.hideDone = !ui.filters.hideDone"
          :class="['text-[11px] px-3 py-1.5 rounded-full border cursor-pointer transition-colors',
                    ui.filters.hideDone ? 'border-accent text-text bg-accentdim' : 'border-border text-dim bg-surface hover:border-bstrong']">Hide completed</span>
    <button @click="clearFilters" class="bg-transparent border-none px-2 py-1 text-dim hover:bg-surface2 rounded">Clear</button>
    <div class="flex-1"></div>
    <div class="w-[160px]"><Select v-model="ui.sort" :options="SORT_OPTIONS" size="sm" /></div>
  </div>
  <div v-if="selected.size" class="flex items-center gap-2.5 mb-3 px-3 py-2 bg-accentdim border border-accent/40 rounded-lg text-[12px]">
    <span class="text-dim">{{ selected.size }} selected</span>
    <div class="w-[150px]"><Select :model-value="''" @update:model-value="bulkSetStatus" :options="bulkStatusOptions" size="sm" /></div>
    <div class="w-[150px]"><Select :model-value="''" @update:model-value="bulkSetPriority" :options="bulkPriorityOptions" size="sm" /></div>
    <button @click="bulkDelete" class="bg-transparent border border-border px-2.5 py-1.5 text-dim hover:text-critical hover:border-critical/40 rounded-md">Delete</button>
    <button @click="clearSelection" class="bg-transparent border-none px-2 py-1 text-dim hover:bg-surface2 rounded ml-auto">Clear</button>
  </div>
  <div class="card-elevated bg-surface border border-border rounded-xl p-2">
    <IssueRow v-for="issue in list" :key="issue.id" :issue="issue"
              selectable :selected="selected.has(issue.id)" @toggle-select="toggleSelect" />
    <div v-if="!list.length" class="text-faint text-[12px] text-center py-12">No issues match. Try clearing filters.</div>
  </div>
  `
};
