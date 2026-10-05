export function uid() {
  return Date.now().toString(36).slice(-4).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
}
export function nowIso() {
  return new Date().toISOString();
}
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
export function esc(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export function inlineMd(t) {
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/`(.+?)`/g, "<code>$1</code>");
  return t;
}
export function mdToHtml(src) {
  if (!src) return "";
  const lines = esc(src).split("\n");
  const out = [];
  let inCode = false, inList = false;
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (!inCode) { out.push("<pre><code>"); inCode = true; }
      else { out.push("</code></pre>"); inCode = false; }
      continue;
    }
    if (inCode) { out.push(line + "\n"); continue; }
    const liMatch = line.match(/^\s*-\s+(.*)/);
    if (liMatch) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push("<li>" + inlineMd(liMatch[1]) + "</li>");
      continue;
    } else if (inList) { out.push("</ul>"); inList = false; }
    if (/^##\s+/.test(line)) { out.push("<h4>" + inlineMd(line.replace(/^##\s+/, "")) + "</h4>"); continue; }
    if (/^#\s+/.test(line)) { out.push("<h3>" + inlineMd(line.replace(/^#\s+/, "")) + "</h3>"); continue; }
    if (line.trim() === "") out.push("<br>");
    else out.push("<p>" + inlineMd(line) + "</p>");
  }
  if (inList) out.push("</ul>");
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}
