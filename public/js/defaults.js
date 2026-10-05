import { uid, nowIso } from "./utils.js";

export { STATUS_DEFAULTS, PRIORITY_DEFAULTS, TAG_DEFAULTS, CUSTOMER_DEFAULTS, PROJECT_DEFAULTS } from "./issue-defaults.mjs";

export function seedIssues() {
  const t = nowIso();
  const mk = (title, status, priority, customerId, projectId, tags) => ({
    id: uid(), title, description: "", status, priority,
    customerId: customerId || null, projectId: projectId || null,
    tags: tags || [], createdAt: t, updatedAt: t, dueDate: null, notes: "",
    timeline: [{ ts: t, type: "created", text: "Issue created" }],
    attachments: [], links: []
  });
  return [
    mk("Maximo API timeout", "in_progress", "high", "banenor", "maximo", ["bug"]),
    mk("Dark mode bug", "backlog", "high", null, "darkmode", ["bug"]),
    mk("Customer request", "inbox", "medium", "statnett", "eroom", ["feature"])
  ];
}
