const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data", "store.json");

const STATUS_DEFAULTS = [
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
const PRIORITY_DEFAULTS = [
  { key: "critical", label: "Critical", color: "#f0465c" },
  { key: "high", label: "High", color: "#f5a524" },
  { key: "medium", label: "Medium", color: "#4f7cff" },
  { key: "low", label: "Low", color: "#7d8794" }
];
const TAG_DEFAULTS = [
  { id: "bug", name: "Bug", color: "#f0465c" },
  { id: "feature", name: "Feature", color: "#4f7cff" },
  { id: "techdebt", name: "Technical Debt", color: "#f5a524" },
  { id: "meeting", name: "Meeting", color: "#c084fc" },
  { id: "idea", name: "Idea", color: "#2dd4a5" },
  { id: "docs", name: "Documentation", color: "#7d8794" }
];
const CUSTOMER_DEFAULTS = [
  { id: "banenor", name: "Bane NOR" },
  { id: "statnett", name: "Statnett" },
  { id: "avinor", name: "Avinor" }
];
const PROJECT_DEFAULTS = [
  { id: "maximo", name: "Maximo", customerId: "banenor", color: "#4f7cff", archived: false },
  { id: "darkmode", name: "Dark Mode", customerId: null, color: "#c084fc", archived: false },
  { id: "eroom", name: "eRoom", customerId: "statnett", color: "#2dd4a5", archived: false },
  { id: "mcpacker", name: "MC Packer", customerId: "avinor", color: "#f5a524", archived: false }
];

function readStore() {
  if (!fs.existsSync(DATA_FILE)) return {};
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function writeStore(store) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store));
}

const store = readStore();
if (store._alfred) throw new Error('This store has durable sync enabled. Use the TODO API to change data; do not reseed or edit the live file.');
const force = process.argv.includes("--force");

function seed(key, value) {
  if (force || !(key in store)) {
    store[key] = JSON.stringify(value);
    console.log(`seeded ${key}`);
  } else {
    console.log(`skipped ${key} (already exists, use --force to overwrite)`);
  }
}

seed("wt:statuses", STATUS_DEFAULTS);
seed("wt:priorities", PRIORITY_DEFAULTS);
seed("wt:tags", TAG_DEFAULTS);
seed("wt:customers", CUSTOMER_DEFAULTS);
seed("wt:projects", PROJECT_DEFAULTS);
if (force || !("wt:issues" in store)) {
  seed("wt:issues", []);
} else {
  console.log("skipped wt:issues (already exists, use --force to overwrite)");
}

writeStore(store);
console.log("done ->", DATA_FILE);
