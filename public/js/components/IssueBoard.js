import { computed, ref, watch } from "vue";
import { db, ui, updateIssue, openIssue, priorityObj, projectName, customerName, isOverdue, showToast } from "../store.js";
import { fmtDate } from "../utils.js";

export default {
  setup() {
    const dragging = ref(null);
    const over = ref(null);
    const saving = ref(false);
    const announcement = ref("");
    const issues = computed(() => {
      const query = ui.search.trim().toLowerCase();
      return db.issues.filter(issue => (issue.register || "work") === ui.register &&
        (!query || [issue.title, issue.description, projectName(issue.projectId), customerName(issue.customerId)].join(" ").toLowerCase().includes(query)));
    });
    const columns = computed(() => {
      const statuses = [...db.statuses];
      for (const issue of issues.value) {
        if (!statuses.some(status => status.key === issue.status)) statuses.push({ key: issue.status, label: issue.status || "No status", color: "#7d8794" });
      }
      return statuses.map(status => ({ ...status, issues: issues.value.filter(issue => issue.status === status.key) }));
    });
    function endDrag() { dragging.value = null; over.value = null; }
    watch(() => ui.register, endDrag);
    function startDrag(event, issue) {
      if (saving.value) { event.preventDefault(); return; }
      dragging.value = issue.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", issue.id);
    }
    async function moveIssue(id, status) {
      const issue = db.issues.find(item => item.id === id);
      if (saving.value || !issue || (issue.register || "work") !== ui.register || issue.status === status || !db.statuses.some(item => item.key === status)) return;
      const previous = { status: issue.status, updatedAt: issue.updatedAt, timeline: [...(issue.timeline || [])] };
      saving.value = true;
      try {
        issue.timeline ||= [];
        if (await updateIssue(id, { status }) === false) throw new Error("Save failed");
        announcement.value = issue.title + " moved to " + db.statuses.find(item => item.key === status).label;
      } catch (error) {
        Object.assign(issue, previous);
        announcement.value = "Status could not be saved. Please try again.";
        showToast({ message: announcement.value });
      } finally { saving.value = false; }
    }
    function dragOver(event, status) {
      if (!dragging.value || saving.value || !db.statuses.some(item => item.key === status)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      over.value = status;
    }
    function drop(event, status) {
      event.preventDefault();
      const id = dragging.value;
      endDrag();
      if (id) return moveIssue(id, status);
    }
    return { db, ui, issues, columns, dragging, over, saving, announcement, startDrag, endDrag, dragOver, drop, moveIssue, openIssue, priorityObj, projectName, customerName, isOverdue, fmtDate };
  },
  template: `
    <div class="mb-5">
      <h1 class="text-[17px] font-semibold tracking-tight">{{ ui.register === 'work' ? 'Work' : 'Private' }} card overview <span class="text-dim text-[12px] font-normal">{{ issues.length }} issues</span></h1>
      <p class="text-dim text-[12px] mt-2">Drag a card to change its status. Select a title to open the issue.</p>
      <p role="status" aria-live="polite" class="text-dim text-[12px] mt-2">{{ saving ? 'Saving status…' : announcement }}</p>
    </div>
    <div class="issue-board" :aria-label="ui.register + ' issue board'" :aria-busy="saving">
      <section v-for="column in columns" :key="column.key" class="board-column" :class="{ 'board-drop-target': over === column.key }"
        :aria-label="column.label" @dragover="dragOver($event, column.key)" @dragleave="!$event.currentTarget.contains($event.relatedTarget) && (over = null)" @drop="drop($event, column.key)">
        <h2 class="board-column-heading"><span class="board-status-dot" :style="{ background: column.color }"></span>{{ column.label }}<span class="ml-auto text-dim font-mono">{{ column.issues.length }}</span></h2>
        <article v-for="issue in column.issues" :key="issue.id" class="board-card card-elevated" :class="{ 'board-card-dragging': dragging === issue.id }"
          :draggable="!saving" @dragstart="startDrag($event, issue)" @dragend="endDrag">
          <div class="flex items-center justify-between gap-2 mb-3"><span class="font-mono text-[10px] text-dim">#{{ issue.id }}</span><span class="badge" :style="{ color: priorityObj(issue.priority).color }">{{ priorityObj(issue.priority).label }}</span></div>
          <button type="button" class="board-card-title" @click="openIssue(issue.id)">{{ issue.title }}</button>
          <p v-if="projectName(issue.projectId) || customerName(issue.customerId)" class="text-[11px] text-dim mt-3">{{ [projectName(issue.projectId), customerName(issue.customerId)].filter(Boolean).join(' · ') }}</p>
          <p v-if="issue.dueDate" class="text-[11px] mt-3" :class="isOverdue(issue) ? 'text-critical' : 'text-dim'">{{ isOverdue(issue) ? 'Overdue' : 'Due' }} {{ fmtDate(issue.dueDate) }}</p>
        </article>
        <p v-if="!column.issues.length" class="board-empty">No issues · Drop a card here</p>
      </section>
    </div>
  `
};
