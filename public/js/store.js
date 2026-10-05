import { reactive } from "vue";
import { storeGet, storeSet } from "./api.js";
import { uid, nowIso, todayStr } from "./utils.js";
import { makeIssue, patchIssue, issueIsOverdue } from "./issue-domain.mjs";
import {
  STATUS_DEFAULTS, PRIORITY_DEFAULTS, TAG_DEFAULTS,
  CUSTOMER_DEFAULTS, PROJECT_DEFAULTS, seedIssues
} from "./defaults.js";

export const db = reactive({
  issues: [], customers: [], projects: [], tags: [], statuses: [], priorities: []
});

export const ui = reactive({
  view: "board",
  register: "work",
  activeIssueId: null,
  activeTab: "basic",
  previewMode: { desc: true, notes: true },
  filters: { customer: "", project: "", status: "", priority: "", dueToday: false, waiting: false, overdue: false, hideDone: true },
  search: "",
  sort: "updated"
});

export const toast = reactive({ visible: false, message: "", actionLabel: "", onAction: null });
let toastTimer = null;
export function showToast({ message, actionLabel, onAction, duration = 5000 }) {
  toast.message = message;
  toast.actionLabel = actionLabel || "";
  toast.onAction = onAction || null;
  toast.visible = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.visible = false; }, duration);
}
export function runToastAction() {
  if (toast.onAction) toast.onAction();
  toast.visible = false;
  clearTimeout(toastTimer);
}
export function dismissToast() {
  toast.visible = false;
  clearTimeout(toastTimer);
}

export async function loadAll() {
  const [issues, customers, projects, tags, statuses, priorities] = await Promise.all([
    storeGet("wt:issues"), storeGet("wt:customers"), storeGet("wt:projects"),
    storeGet("wt:tags"), storeGet("wt:statuses"), storeGet("wt:priorities")
  ]);

  db.customers = customers || CUSTOMER_DEFAULTS.slice();
  db.projects = projects || PROJECT_DEFAULTS.slice();
  db.tags = tags || TAG_DEFAULTS.slice();
  db.statuses = statuses || STATUS_DEFAULTS.slice();
  db.priorities = priorities || PRIORITY_DEFAULTS.slice();

  if (issues) db.issues = issues;
  else { db.issues = seedIssues(); await storeSet("wt:issues", db.issues); }

  if (!customers) await storeSet("wt:customers", db.customers);
  if (!projects) await storeSet("wt:projects", db.projects);
  if (!tags) await storeSet("wt:tags", db.tags);
  if (!statuses) await storeSet("wt:statuses", db.statuses);
  if (!priorities) await storeSet("wt:priorities", db.priorities);
}

export function byId(arr, id) {
  return arr.find((x) => x.id === id) || null;
}
export function customerName(id) {
  const c = byId(db.customers, id);
  return c ? c.name : "";
}
export function projectName(id) {
  const p = byId(db.projects, id);
  return p ? p.name : "";
}
export function projectRegister(project) {
  return project.register || "work";
}
export function statusObj(key) {
  return db.statuses.find((s) => s.key === key) || db.statuses[0];
}
export function priorityObj(key) {
  return db.priorities.find((p) => p.key === key) || db.priorities[db.priorities.length - 1];
}
export function priorityRank(key) {
  const i = db.priorities.findIndex((p) => p.key === key);
  return i === -1 ? 99 : i;
}
export function isOverdue(issue) {
  return issueIsOverdue(issue, todayStr());
}
export function isDueToday(issue) {
  return issue.dueDate === todayStr();
}

export async function saveIssues() { return await storeSet("wt:issues", db.issues); }
export async function saveCustomers() { await storeSet("wt:customers", db.customers); }
export async function saveProjects() { await storeSet("wt:projects", db.projects); }
export async function saveTags() { await storeSet("wt:tags", db.tags); }
export async function saveStatuses() { await storeSet("wt:statuses", db.statuses); }
export async function savePriorities() { await storeSet("wt:priorities", db.priorities); }

export function addTimeline(issue, type, text) {
  issue.timeline.push({ ts: nowIso(), type, text });
}

export async function createIssue({ title, customerId, projectId, description, status, priority, register }) {
  const issue = makeIssue({ title, customerId, projectId, description, status, priority, register },
    { id: uid(), now: nowIso(), register: ui.register, projects: db.projects });
  db.issues.unshift(issue);
  await saveIssues();
  return issue;
}

export async function updateIssue(id, patch) {
  const issue = byId(db.issues, id);
  if (!issue) return;
  patchIssue(issue, patch, { now: nowIso(), statuses: db.statuses, priorities: db.priorities });
  return await saveIssues();
}

export function computeCounts(issues = db.issues) {
  const c = { today: 0, inProgress: 0, waiting: 0, overdue: 0, backlog: 0 };
  for (const i of issues) {
    if (isDueToday(i)) c.today++;
    if (i.status === "in_progress") c.inProgress++;
    if (i.status === "waiting_customer" || i.status === "waiting_internal") c.waiting++;
    if (isOverdue(i)) c.overdue++;
    if (i.status === "backlog") c.backlog++;
  }
  return c;
}

const SORTERS = {
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  created: (a, b) => b.createdAt.localeCompare(a.createdAt),
  priority: (a, b) => priorityRank(a.priority) - priorityRank(b.priority),
  dueDate: (a, b) => (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99"),
  title: (a, b) => a.title.localeCompare(b.title)
};

export function filteredIssues() {
  const f = ui.filters, q = ui.search.trim().toLowerCase();
  const isDoneStatus = (s) => s === "done" || s === "archived";
  return db.issues.filter((i) => {
    if ((i.register || "work") !== ui.register) return false;
    if (f.customer && i.customerId !== f.customer) return false;
    if (f.project && i.projectId !== f.project) return false;
    if (f.status && i.status !== f.status) return false;
    if (f.priority && i.priority !== f.priority) return false;
    if (f.dueToday && !isDueToday(i)) return false;
    if (f.waiting && !(i.status === "waiting_customer" || i.status === "waiting_internal")) return false;
    if (f.overdue && !isOverdue(i)) return false;
    if (f.hideDone && !isDoneStatus(f.status) && isDoneStatus(i.status)) return false;
    if (q) {
      const hay = [i.title, i.description, i.notes, customerName(i.customerId), projectName(i.projectId)];
      (i.tags || []).forEach((tid) => { const t = byId(db.tags, tid); if (t) hay.push(t.name); });
      (i.timeline || []).forEach((e) => { if (e.type === "comment") hay.push(e.text); });
      if (!hay.join(" ").toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort(SORTERS[ui.sort] || SORTERS.updated);
}

/* Settings CRUD, shared by all five taxonomy kinds */
const KIND_MAP = {
  customers: { arr: () => db.customers, key: "id", save: saveCustomers },
  projects: { arr: () => db.projects, key: "id", save: saveProjects },
  tags: { arr: () => db.tags, key: "id", save: saveTags },
  statuses: { arr: () => db.statuses, key: "key", save: saveStatuses },
  priorities: { arr: () => db.priorities, key: "key", save: savePriorities }
};

export async function addSettingsItem(kind, name) {
  name = name.trim();
  if (!name) return;
  if (kind === "customers") db.customers.push({ id: uid().toLowerCase(), name });
  else if (kind === "projects") db.projects.push({ id: uid().toLowerCase(), name, customerId: null, color: "#4f7cff", archived: false, register: ui.register });
  else if (kind === "tags") db.tags.push({ id: uid().toLowerCase(), name, color: "#4f7cff" });
  else if (kind === "statuses") db.statuses.push({ key: name.toLowerCase().replace(/\s+/g, "_"), label: name, color: "#4f7cff" });
  else if (kind === "priorities") db.priorities.push({ key: name.toLowerCase().replace(/\s+/g, "_"), label: name, color: "#4f7cff" });
  await KIND_MAP[kind].save();
}

export async function deleteSettingsItem(kind, id) {
  const m = KIND_MAP[kind];
  const arr = m.arr();
  const idx = arr.findIndex((x) => x[m.key] === id);
  if (idx !== -1) arr.splice(idx, 1);
  await m.save();
}

export async function saveSettingsKind(kind) {
  await KIND_MAP[kind].save();
}

export async function deleteIssues(ids) {
  const idSet = new Set(ids);
  const removed = [];
  db.issues.forEach((issue, idx) => { if (idSet.has(issue.id)) removed.push({ issue, idx }); });
  if (!removed.length) return;
  db.issues = db.issues.filter((i) => !idSet.has(i.id));
  await saveIssues();
  showToast({
    message: removed.length === 1 ? "Issue deleted" : removed.length + " issues deleted",
    actionLabel: "Undo",
    onAction: async () => {
      removed.sort((a, b) => a.idx - b.idx).forEach(({ issue, idx }) => db.issues.splice(idx, 0, issue));
      await saveIssues();
    }
  });
}
export async function deleteIssue(id) {
  await deleteIssues([id]);
}

export function openIssue(id) {
  ui.activeIssueId = id;
  ui.activeTab = "basic";
  ui.previewMode = { desc: true, notes: true };
}
export function closeIssue() {
  ui.activeIssueId = null;
}
