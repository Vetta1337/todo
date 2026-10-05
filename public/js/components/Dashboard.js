import { computed } from "vue";
import { db, ui, computeCounts, priorityRank, isOverdue, projectRegister } from "../store.js";
import { todayStr } from "../utils.js";
import IssueRow from "./IssueRow.js";

export default {
  components: { IssueRow },
  setup() {
    const counts = computed(() => computeCounts(issues.value));
    const issues = computed(() => db.issues.filter((i) => (i.register || "work") === ui.register));
    const active = computed(() => issues.value.filter((i) => i.status !== "done" && i.status !== "archived"));
    const myWork = computed(() =>
      [...active.value].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)).slice(0, 8)
    );
    const waiting = computed(() => issues.value.filter((i) => i.status === "waiting_customer").slice(0, 8));
    const overdue = computed(() => issues.value.filter(isOverdue).slice(0, 8));
    const recent = computed(() => [...issues.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5));
    const completedToday = computed(() =>
      issues.value.filter((i) => i.status === "done" && i.updatedAt.slice(0, 10) === todayStr()).slice(0, 8)
    );
    const statusChart = computed(() => {
      const groups = [
        { label: "Open", color: "#4f7cff", matches: (s) => !["done", "archived", "waiting_customer", "waiting_internal"].includes(s) },
        { label: "Waiting", color: "#c084fc", matches: (s) => s === "waiting_customer" || s === "waiting_internal" },
        { label: "Completed", color: "#2dd4a5", matches: (s) => s === "done" },
        { label: "Archived", color: "#7d8794", matches: (s) => s === "archived" }
      ];
      return groups.map((group) => ({ ...group, count: issues.value.filter((issue) => group.matches(issue.status)).length }));
    });
    const projectChart = computed(() => {
      const projects = db.projects.filter((project) => projectRegister(project) === ui.register);
      const rows = projects.map((project) => ({ label: project.name, color: project.color, count: issues.value.filter((issue) => issue.projectId === project.id).length }));
      const unassigned = issues.value.filter((issue) => !issue.projectId || !projects.some((project) => project.id === issue.projectId)).length;
      if (unassigned) rows.push({ label: "No project", color: "#7d8794", count: unassigned });
      return rows.filter((row) => row.count).sort((a, b) => b.count - a.count).slice(0, 6);
    });
    const completedWeek = computed(() => {
      const days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() - (6 - index));
        return { date: [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-"), label: date.toLocaleDateString(undefined, { weekday: "short" }), count: 0 };
      });
      for (const issue of issues.value) {
        if (issue.status !== "done") continue;
        const completedAt = [...(issue.timeline || [])].reverse().find((event) => event.type === "completed")?.ts || issue.updatedAt;
        const completedDate = completedAt ? new Date(completedAt) : null;
        const dateKey = completedDate && !Number.isNaN(completedDate.getTime())
          ? [completedDate.getFullYear(), String(completedDate.getMonth() + 1).padStart(2, "0"), String(completedDate.getDate()).padStart(2, "0")].join("-") : "";
        const day = days.find((entry) => entry.date === dateKey);
        if (day) day.count++;
      }
      return days;
    });
    const maxCompleted = computed(() => Math.max(1, ...completedWeek.value.map((day) => day.count)));
    return { db, counts, myWork, waiting, overdue, recent, completedToday, issues, ui, statusChart, projectChart, completedWeek, maxCompleted };
  },
  template: `
  <h1 class="text-[17px] font-semibold mb-5 tracking-tight">{{ ui.register === 'work' ? 'Work' : 'Private' }} dashboard</h1>
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
    <div class="card-elevated bg-surface border border-border rounded-xl px-4 py-3.5">
      <div class="text-2xl font-semibold font-mono">{{ db.issues.filter(i => i.status !== 'done' && i.status !== 'archived').length }}</div>
      <div class="text-[11px] text-dim mt-1">Open tasks, both registers</div>
    </div>
    <div class="card-elevated bg-surface border border-border rounded-xl px-4 py-3.5">
      <div class="text-2xl font-semibold font-mono">{{ counts.today }}</div>
      <div class="text-[11px] text-dim mt-1">Today</div>
    </div>
    <div class="card-elevated bg-surface border border-border rounded-xl px-4 py-3.5">
      <div class="text-2xl font-semibold font-mono text-high">{{ counts.inProgress }}</div>
      <div class="text-[11px] text-dim mt-1">In progress</div>
    </div>
    <div class="card-elevated bg-surface border border-border rounded-xl px-4 py-3.5">
      <div class="text-2xl font-semibold font-mono text-waiting">{{ counts.waiting }}</div>
      <div class="text-[11px] text-dim mt-1">Waiting</div>
    </div>
    <div class="card-elevated bg-surface border border-border rounded-xl px-4 py-3.5 relative overflow-hidden">
      <div v-if="counts.overdue" class="absolute left-0 top-0 bottom-0 w-[3px] bg-critical"></div>
      <div class="text-2xl font-semibold font-mono" :class="counts.overdue ? 'text-critical' : ''">{{ counts.overdue }}</div>
      <div class="text-[11px] text-dim mt-1">Overdue</div>
    </div>
    <div class="card-elevated bg-surface border border-border rounded-xl px-4 py-3.5">
      <div class="text-2xl font-semibold font-mono">{{ counts.backlog }}</div>
      <div class="text-[11px] text-dim mt-1">Backlog</div>
    </div>
  </div>
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
    <section class="card-elevated bg-surface border border-border rounded-xl p-4" aria-label="Issue status chart">
      <h2 class="text-[11px] uppercase tracking-wider text-dim font-semibold mb-1">Status breakdown</h2>
      <p class="text-[11px] text-faint mb-4">{{ ui.register === 'work' ? 'Work' : 'Private' }} issues, including completed</p>
      <div v-for="row in statusChart" :key="row.label" class="mb-3 last:mb-0">
        <div class="flex justify-between text-[11px] mb-1"><span>{{ row.label }}</span><span class="font-mono text-dim">{{ row.count }}</span></div>
        <div class="h-2 bg-surface2 rounded-full overflow-hidden"><div class="h-full rounded-full" :style="{ width: (issues.length ? row.count / issues.length * 100 : 0) + '%', background: row.color }"></div></div>
      </div>
    </section>
    <section class="card-elevated bg-surface border border-border rounded-xl p-4" aria-label="Project issue chart">
      <h2 class="text-[11px] uppercase tracking-wider text-dim font-semibold mb-1">Issues by project</h2>
      <p class="text-[11px] text-faint mb-4">Top projects in {{ ui.register === 'work' ? 'Work' : 'Private' }}</p>
      <div v-if="!projectChart.length" class="text-[12px] text-faint py-4">No project issues yet.</div>
      <div v-for="row in projectChart" :key="row.label" class="mb-3 last:mb-0">
        <div class="flex justify-between gap-2 text-[11px] mb-1"><span class="truncate">{{ row.label }}</span><span class="font-mono text-dim">{{ row.count }}</span></div>
        <div class="h-2 bg-surface2 rounded-full overflow-hidden"><div class="h-full rounded-full" :style="{ width: (issues.length ? row.count / issues.length * 100 : 0) + '%', background: row.color }"></div></div>
      </div>
    </section>
    <section class="card-elevated bg-surface border border-border rounded-xl p-4" aria-label="Completed issues over seven days">
      <h2 class="text-[11px] uppercase tracking-wider text-dim font-semibold mb-1">Completed this week</h2>
      <p class="text-[11px] text-faint mb-4">Last 7 days in {{ ui.register === 'work' ? 'Work' : 'Private' }}</p>
      <div class="flex items-end gap-2 h-32" role="img" :aria-label="completedWeek.map(day => day.label + ': ' + day.count).join(', ')">
        <div v-for="day in completedWeek" :key="day.date" class="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1" :title="day.date + ': ' + day.count + ' completed'">
          <span class="font-mono text-[10px] text-dim">{{ day.count }}</span>
          <div class="w-full max-w-10 bg-done rounded-t-sm" :style="{ height: Math.max(3, day.count / maxCompleted * 88) + 'px', opacity: day.count ? 1 : 0.25 }"></div>
          <span class="text-[10px] text-faint">{{ day.label }}</span>
        </div>
      </div>
    </section>
  </div>
  <div class="grid grid-cols-2 gap-4">
    <div v-for="w in [
      ['My work', myWork],
      ['Waiting on customer', waiting],
      ['Overdue', overdue],
      ['Recently updated', recent],
      ['Completed today', completedToday]
    ]" :key="w[0]" class="card-elevated bg-surface border border-border rounded-xl p-4">
      <h3 class="text-[11px] uppercase tracking-wider text-dim font-semibold mb-3">{{ w[0] }}</h3>
      <div v-if="!w[1].length" class="text-[12px] text-faint py-2">Nothing here.</div>
      <IssueRow v-for="issue in w[1]" :key="issue.id" :issue="issue" />
    </div>
  </div>
  `
};
