function handleUnauthorized() {
  window.location.href = "login.html";
}

// Serialize browser saves and reject stale writes from other tabs or ALFRED.
const versions = new Map();
const queues = new Map();
const conflicts = new Set();

export async function storeGet(key) {
  try {
    const res = await fetch("api/storage/" + encodeURIComponent(key));
    if (res.headers.get("ETag")) versions.set(key, res.headers.get("ETag"));
    if (res.ok || res.status === 404) conflicts.delete(key);
    if (res.status === 401) { handleUnauthorized(); return null; }
    if (!res.ok) return null;
    const data = await res.json();
    return data.value != null ? JSON.parse(data.value) : null;
  } catch (e) {
    return null;
  }
}

export function storeSet(key, val) {
  const value = JSON.stringify(val);
  const job = (queues.get(key) || Promise.resolve()).then(() => writeValue(key, value));
  queues.set(key, job.catch(() => false));
  return job;
}

async function writeValue(key, value) {
  try {
    if (conflicts.has(key)) return false;
    const res = await fetch("api/storage/" + encodeURIComponent(key), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(versions.has(key) ? { "If-Match": versions.get(key) } : {}) },
      body: JSON.stringify({ value })
    });
    if (res.status === 401) { handleUnauthorized(); return false; }
    if (res.status === 409) {
      conflicts.add(key);
      alert("Your TODOs changed in another session. This change was not saved. Reload the page before editing again.");
      return false;
    }
    if (!res.ok) {
      const body = await res.text();
      console.error("storage set failed", key, res.status, body);
      alert("Save failed (" + res.status + ") for " + key + ". Check server logs.");
      return false;
    }
    if (res.headers.get("ETag")) versions.set(key, res.headers.get("ETag"));
    return true;
  } catch (e) {
    console.error("storage set failed", key, e);
    alert("Save failed for " + key + ": " + e.message);
    return false;
  }
}
