export const STATUS_DEFAULTS = [
  { key: "inbox", label: "Inbox", color: "#7d8794" },
  { key: "backlog", label: "Backlog", color: "#9aa3b2" },
  { key: "ready", label: "Ready", color: "#4f7cff" },
  { key: "in_progress", label: "In Progress", color: "#f5a524" },
  { key: "waiting_customer", label: "Waiting Customer", color: "#c084fc" },
  { key: "waiting_internal", label: "Waiting Internal", color: "#a855f7" },
  { key: "testing", label: "Testing", color: "#22d3ee" },
  { key: "done", label: "Done", color: "#2dd4a5" },
  { key: "archived", label: "Archived", color: "#4b5563" }
];

export const PRIORITY_DEFAULTS = [
  { key: "critical", label: "Critical", color: "#f0465c" },
  { key: "high", label: "High", color: "#f5a524" },
  { key: "medium", label: "Medium", color: "#4f7cff" },
  { key: "low", label: "Low", color: "#7d8794" }
];

export const TAG_DEFAULTS = [
  { id: "bug", name: "Bug", color: "#f0465c" },
  { id: "feature", name: "Feature", color: "#4f7cff" },
  { id: "techdebt", name: "Technical Debt", color: "#f5a524" },
  { id: "meeting", name: "Meeting", color: "#c084fc" },
  { id: "idea", name: "Idea", color: "#2dd4a5" },
  { id: "docs", name: "Documentation", color: "#7d8794" }
];

export const CUSTOMER_DEFAULTS = [
  { id: "banenor", name: "Bane NOR" },
  { id: "statnett", name: "Statnett" },
  { id: "avinor", name: "Avinor" }
];

export const PROJECT_DEFAULTS = [
  { id: "maximo", name: "Maximo", customerId: "banenor", color: "#4f7cff", archived: false },
  { id: "darkmode", name: "Dark Mode", customerId: null, color: "#c084fc", archived: false },
  { id: "eroom", name: "eRoom", customerId: "statnett", color: "#2dd4a5", archived: false },
  { id: "mcpacker", name: "MC Packer", customerId: "avinor", color: "#f5a524", archived: false }
];

