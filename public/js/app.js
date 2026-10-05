import { createApp, ref, computed, nextTick } from "vue";
import { loadAll, ui } from "./store.js";
import Sidebar from "./components/Sidebar.js";
import Dashboard from "./components/Dashboard.js";
import IssueBoard from "./components/IssueBoard.js";
import IssuesList from "./components/IssuesList.js";
import SettingsView from "./components/SettingsView.js";
import IssuePanel from "./components/IssuePanel.js";
import QuickAddModal from "./components/QuickAddModal.js";
import Toast from "./components/Toast.js";

const App = {
  components: { Sidebar, Dashboard, IssueBoard, IssuesList, SettingsView, IssuePanel, QuickAddModal, Toast },
  setup() {
    const loaded = ref(false);
    const quickAddOpen = ref(false);
    const searchInput = ref(null);

    const currentView = computed(() => ui.view);
    const settingsKind = computed(() =>
      ["customers", "projects", "tags", "statuses", "priorities"].includes(ui.view) ? ui.view : null
    );

    function onSearchInput(e) {
      ui.search = e.target.value;
      if (ui.view !== "issues" && ui.view !== "board") ui.view = "issues";
    }

    function onKeydown(e) {
      const tag = (e.target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select";
      if (e.key === "Escape") {
        if (quickAddOpen.value) quickAddOpen.value = false;
        else if (ui.activeIssueId) ui.activeIssueId = null;
        return;
      }
      if (typing) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault(); quickAddOpen.value = true;
      } else if (e.key === "/") {
        e.preventDefault(); searchInput.value?.focus();
      }
    }

    loadAll().then(() => { loaded.value = true; });
    document.addEventListener("keydown", onKeydown);

    return { loaded, quickAddOpen, searchInput, ui, currentView, settingsKind, onSearchInput };
  },
  template: `
  <div v-if="loaded" class="flex h-screen overflow-hidden">
    <Sidebar />
    <div class="flex-1 flex flex-col min-w-0">
      <div class="flex items-center gap-3 px-6 py-3.5 border-b border-border flex-none">
        <input ref="searchInput" :value="ui.search" @input="onSearchInput"
               placeholder="Search everything..." class="flex-1 max-w-[420px]">
        <div class="flex-1"></div>
        <button @click="quickAddOpen = true" class="bg-accent border-accent text-white px-3 py-1.5 rounded-md hover:bg-[#3f6bef] flex-none shadow-pop">+ New issue</button>
      </div>
      <div class="flex-1 overflow-y-auto px-7 py-6">
        <Dashboard v-if="currentView === 'dashboard'" />
        <IssueBoard v-else-if="currentView === 'board'" />
        <IssuesList v-else-if="currentView === 'issues'" />
        <SettingsView v-else-if="settingsKind" :kind="settingsKind" />
      </div>
    </div>
    <IssuePanel />
    <QuickAddModal :open="quickAddOpen" @close="quickAddOpen = false" />
    <Toast />
  </div>
  <div v-else class="flex items-center justify-center h-screen text-faint text-[12px]">Loading...</div>
  `
};

createApp(App).mount("#app");
