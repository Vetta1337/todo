import { computed } from "vue";
import { db, ui, computeCounts } from "../store.js";

const ICONS = {
  board: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="14" rx="1"/>',
  dashboard: '<path d="M3 3h7v7H3V3zM12 3h7v4h-7V3zM12 9h7v10h-7V9zM3 12h7v7H3v-7z"/>',
  issues: '<path d="M4 4h16v3H4V4zM4 10.5h16v3H4v-3zM4 17h10v3H4v-3z"/>',
  customers: '<path d="M4 20V6l8-3 8 3v14M9 20v-6h6v6M4 20h16"/>',
  projects: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"/>',
  tags: '<path d="M20 12.5 12.5 20 3 10.5V3h7.5L20 12.5z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  statuses: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  priorities: '<path d="M5 3v18M5 4h11l-3 4 3 4H5"/>'
};

export default {
  setup() {
    const counts = computed(computeCounts);
    const mainItems = [
      { v: "board", label: "Card overview" },
      { v: "dashboard", label: "Dashboard" },
      { v: "issues", label: "Issues", withCount: true },
      { v: "customers", label: "Customers" },
      { v: "projects", label: "Projects" }
    ];
    const settingsItems = [
      { v: "tags", label: "Tags" },
      { v: "statuses", label: "Statuses" },
      { v: "priorities", label: "Priorities" }
    ];
    function go(v) {
      ui.view = v;
      ui.search = "";
    }
    function setRegister(register) {
      ui.register = register;
      ui.search = "";
      ui.filters.project = "";
    }
    async function logout() {
      await fetch("api/logout", { method: "POST" });
      window.location.href = "login.html";
    }
    return { db, ui, counts, mainItems, settingsItems, go, setRegister, logout, ICONS };
  },
  template: `
  <div class="w-[212px] flex-none bg-panel border-r border-border flex flex-col p-3">
    <div class="font-mono font-bold text-[15px] tracking-wide px-2 pt-1 pb-4 flex items-center gap-2">
      <span class="w-1.5 h-4 bg-accent rounded-sm"></span>
      Emil's<span class="text-accent">ToDo</span>
    </div>
    <div class="grid grid-cols-2 gap-1 mb-3" role="tablist" aria-label="Issue register">
      <button v-for="register in ['work', 'private']" :key="register" type="button" role="tab"
              :aria-selected="ui.register === register" @click="setRegister(register)"
              class="rounded-md px-2 py-2 text-xs font-semibold capitalize"
              :class="ui.register === register ? 'bg-accent text-white' : 'bg-surface text-dim hover:text-text'">{{ register }}</button>
    </div>
    <div class="mb-2 flex flex-col gap-0.5">
      <div v-for="it in mainItems" :key="it.v"
           @click="go(it.v)"
           class="relative flex items-center gap-2.5 px-2.5 py-[7px] rounded-md cursor-pointer transition-colors group"
           :class="ui.view===it.v ? 'bg-surface text-text' : 'text-dim hover:bg-surface hover:text-text'">
        <span v-if="ui.view===it.v" class="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-accent rounded-full"></span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" :stroke="ui.view===it.v ? '#4f7cff' : 'currentColor'"
             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="flex-none" v-html="ICONS[it.v]"></svg>
        <span class="flex-1">{{ it.label }}</span>
        <span v-if="it.withCount" class="font-mono text-[11px] text-faint">{{ db.issues.filter(i => i.status !== 'done' && i.status !== 'archived').length }}</span>
      </div>
    </div>
    <div class="text-[10px] uppercase tracking-wider text-faint px-2.5 pt-3 pb-1.5">Settings</div>
    <div class="flex flex-col gap-0.5">
      <div v-for="it in settingsItems" :key="it.v"
           @click="go(it.v)"
           class="relative flex items-center gap-2.5 px-2.5 py-[7px] rounded-md cursor-pointer transition-colors"
           :class="ui.view===it.v ? 'bg-surface text-text' : 'text-dim hover:bg-surface hover:text-text'">
        <span v-if="ui.view===it.v" class="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-accent rounded-full"></span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" :stroke="ui.view===it.v ? '#4f7cff' : 'currentColor'"
             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="flex-none" v-html="ICONS[it.v]"></svg>
        <span>{{ it.label }}</span>
      </div>
    </div>
    <div class="mt-auto pt-3 border-t border-border text-[11px] text-faint">
      <div class="flex justify-between py-[3px]"><span>New issue</span><span class="font-mono bg-surface2 border border-border rounded px-1.5 text-dim">N</span></div>
      <div class="flex justify-between py-[3px]"><span>Search</span><span class="font-mono bg-surface2 border border-border rounded px-1.5 text-dim">/</span></div>
      <div class="flex justify-between py-[3px]"><span>Edit title</span><span class="font-mono bg-surface2 border border-border rounded px-1.5 text-dim">E</span></div>
      <div class="flex justify-between py-[3px]"><span>Done</span><span class="font-mono bg-surface2 border border-border rounded px-1.5 text-dim">D</span></div>
      <div class="flex justify-between py-[3px]"><span>Delete</span><span class="font-mono bg-surface2 border border-border rounded px-1.5 text-dim">Del</span></div>
      <div class="flex justify-between py-[3px]"><span>Preview</span><span class="font-mono bg-surface2 border border-border rounded px-1.5 text-dim">Space</span></div>
      <div class="flex justify-between py-[3px]"><span>Close</span><span class="font-mono bg-surface2 border border-border rounded px-1.5 text-dim">Esc</span></div>
    </div>
    <div class="pt-3 mt-2 border-t border-border">
      <div @click="logout" class="flex items-center gap-2.5 px-2.5 py-[7px] rounded-md cursor-pointer text-dim hover:bg-surface hover:text-critical transition-colors text-[12px]">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="flex-none">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>
        </svg>
        <span>Log out</span>
      </div>
    </div>
  </div>
  `
};
