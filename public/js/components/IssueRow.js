import { ref, onMounted, onUnmounted } from "vue";
import {
  db, ui, byId, statusObj, priorityObj, customerName, projectName, isOverdue,
  openIssue, updateIssue, deleteIssue
} from "../store.js";
import { fmtDate } from "../utils.js";

export default {
  props: {
    issue: { type: Object, required: true },
    selectable: { type: Boolean, default: false },
    selected: { type: Boolean, default: false }
  },
  emits: ["toggle-select"],
  setup(props) {
    const hovered = ref(false);

    function onKeydown(e) {
      if (!hovered.value || ui.activeIssueId) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "d" || e.key === "D") {
        e.preventDefault(); updateIssue(props.issue.id, { status: "done" });
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault(); deleteIssue(props.issue.id);
      } else if (e.key === "e" || e.key === "E" || e.key === "Enter") {
        e.preventDefault(); openIssue(props.issue.id);
      }
    }
    onMounted(() => document.addEventListener("keydown", onKeydown));
    onUnmounted(() => document.removeEventListener("keydown", onKeydown));

    return {
      db, hovered, statusObj, priorityObj, customerName, projectName, isOverdue, byId, fmtDate, openIssue
    };
  },
  template: `
  <div @click="openIssue(issue.id)" @mouseenter="hovered = true" @mouseleave="hovered = false"
       class="issue-row-hover flex items-center gap-2.5 py-[7px] px-2 rounded-md cursor-pointer border-b border-border last:border-b-0 transition-colors"
       :class="selected ? 'bg-accentdim' : 'hover:bg-surface2'">
    <span v-if="selectable" class="flex-none w-[14px]" :class="(hovered || selected) ? '' : 'invisible'">
      <input type="checkbox" :checked="selected" @click.stop @change="$emit('toggle-select', issue.id)">
    </span>
    <span class="font-mono text-[11px] text-accent flex-none w-[52px]">#{{ issue.id }}</span>
    <span class="badge" :style="{ background: statusObj(issue.status).color + '26', color: statusObj(issue.status).color }">{{ statusObj(issue.status).label.toUpperCase() }}</span>
    <span class="badge" :class="'badge-' + issue.priority">{{ priorityObj(issue.priority).label.toUpperCase() }}</span>
    <span class="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{{ issue.title }}</span>
    <span v-for="tid in (issue.tags || []).slice(0,2)" :key="tid" class="text-[10px] px-1.5 py-px rounded-full bg-surface2 text-dim border border-border">
      {{ byId(db.tags, tid)?.name }}
    </span>
    <span class="text-[11px] text-faint whitespace-nowrap">
      {{ [customerName(issue.customerId), projectName(issue.projectId), issue.dueDate ? ((isOverdue(issue)?'overdue ':'due ') + fmtDate(issue.dueDate)) : ''].filter(Boolean).join(' \u00b7 ') }}
    </span>
  </div>
  `
};
