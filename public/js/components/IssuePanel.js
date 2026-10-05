import { computed, ref, nextTick, onMounted, onUnmounted } from "vue";
import {
  db, ui, byId, projectRegister, updateIssue, saveIssues, addTimeline, closeIssue, deleteIssue
} from "../store.js";
import { fmtDateTime, mdToHtml, nowIso } from "../utils.js";
import Select from "./Select.js";

const TABS = [
  ["basic", "Basic"], ["notes", "Notes"], ["timeline", "Timeline"],
  ["attachments", "Attachments"], ["links", "Links"]
];
const LINK_PROVIDERS = ["Jira", "GitHub", "Azure DevOps", "Omega", "URL"].map((p) => ({ value: p, label: p }));

export default {
  components: { Select },
  setup() {
    const issue = computed(() => (ui.activeIssueId ? byId(db.issues, ui.activeIssueId) : null));
    const commentText = ref("");
    const linkProvider = ref("Jira");
    const linkUrl = ref("");
    const titleInput = ref(null);
    const dragOver = ref(false);

    const statusOptions = computed(() => db.statuses.map((s) => ({ value: s.key, label: s.label })));
    const priorityOptions = computed(() => db.priorities.map((p) => ({ value: p.key, label: p.label })));
    const registerOptions = [{ value: "work", label: "Work" }, { value: "private", label: "Private" }];
    const customerOptions = computed(() => [
      { value: "", label: "No customer" },
      ...db.customers.map((c) => ({ value: c.id, label: c.name }))
    ]);
    const projectOptions = computed(() => [
      { value: "", label: "No project" },
      ...db.projects.filter((p) => projectRegister(p) === (issue.value?.register || "work")).map((p) => ({ value: p.id, label: p.name }))
    ]);

    function onFieldChange(field, value) {
      const patch = { [field]: value };
      if (field === "register" && issue.value.projectId) {
        const project = byId(db.projects, issue.value.projectId);
        if (project && projectRegister(project) !== value) patch.projectId = null;
      }
      updateIssue(issue.value.id, patch);
    }
    function onProjectChange(projectId) {
      const patch = { projectId };
      const p = projectId ? byId(db.projects, projectId) : null;
      if (p && p.customerId) patch.customerId = p.customerId;
      updateIssue(issue.value.id, patch);
    }
    function saveMarkdownField(field, previewKey, value) {
      updateIssue(issue.value.id, { [field]: value });
      ui.previewMode[previewKey] = true;
    }
    function toggleTag(tid) {
      const tags = (issue.value.tags || []).slice();
      const i = tags.indexOf(tid);
      if (i === -1) tags.push(tid); else tags.splice(i, 1);
      updateIssue(issue.value.id, { tags });
    }
    function markDone() {
      updateIssue(issue.value.id, { status: "done" });
    }
    function removeIssue() {
      deleteIssue(issue.value.id);
      closeIssue();
    }
    function submitComment() {
      const text = commentText.value.trim();
      if (!text) return;
      addTimeline(issue.value, "comment", text);
      issue.value.updatedAt = nowIso();
      commentText.value = "";
      saveIssues();
    }
    function removeAttachment(idx) {
      issue.value.attachments.splice(idx, 1);
      issue.value.updatedAt = nowIso();
      saveIssues();
    }
    function addLink() {
      const url = linkUrl.value.trim();
      if (!url) return;
      issue.value.links.push({ provider: linkProvider.value, url });
      linkUrl.value = "";
      issue.value.updatedAt = nowIso();
      saveIssues();
    }
    function removeLink(idx) {
      issue.value.links.splice(idx, 1);
      issue.value.updatedAt = nowIso();
      saveIssues();
    }
    function handleFiles(fileList) {
      const textTypes = /\.(txt|json|log|csv|md)$/i;
      const files = Array.from(fileList);
      let pending = files.length;
      if (!pending) return;
      files.forEach((file) => {
        if (textTypes.test(file.name) && file.size < 200000) {
          const reader = new FileReader();
          reader.onload = () => {
            issue.value.attachments.push({ name: file.name, size: file.size, type: file.type, content: reader.result.slice(0, 20000) });
            addTimeline(issue.value, "attachment", "Attached " + file.name);
            if (--pending === 0) { issue.value.updatedAt = nowIso(); saveIssues(); }
          };
          reader.readAsText(file);
        } else {
          issue.value.attachments.push({ name: file.name, size: file.size, type: file.type, content: null });
          addTimeline(issue.value, "attachment", "Attached " + file.name);
          if (--pending === 0) { issue.value.updatedAt = nowIso(); saveIssues(); }
        }
      });
    }
    function onDrop(e) {
      dragOver.value = false;
      handleFiles(e.dataTransfer.files);
    }
    function onFilePick(e) {
      handleFiles(e.target.files);
      e.target.value = "";
    }
    function timelineSorted() {
      return [...issue.value.timeline].sort((a, b) => b.ts.localeCompare(a.ts));
    }
    function focusTitle() {
      ui.activeTab = "basic";
      nextTick(() => { if (titleInput.value) { titleInput.value.focus(); titleInput.value.select(); } });
    }
    function onKeydown(e) {
      if (!issue.value) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "e" || e.key === "E") {
        e.preventDefault(); focusTitle();
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault(); markDone();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault(); removeIssue();
      } else if (e.key === " ") {
        e.preventDefault();
        if (ui.activeTab === "basic") ui.previewMode.desc = !ui.previewMode.desc;
        else if (ui.activeTab === "notes") ui.previewMode.notes = !ui.previewMode.notes;
      }
    }
    onMounted(() => document.addEventListener("keydown", onKeydown));
    onUnmounted(() => document.removeEventListener("keydown", onKeydown));

    return {
      ui, issue, TABS, db, commentText, linkProvider, linkUrl, titleInput, dragOver,
      statusOptions, priorityOptions, registerOptions, customerOptions, projectOptions, LINK_PROVIDERS,
      fmtDateTime, mdToHtml,
      onFieldChange, onProjectChange, saveMarkdownField, toggleTag, markDone, removeIssue, submitComment, removeAttachment, addLink,
      removeLink, onDrop, onFilePick, timelineSorted, focusTitle, closeIssue
    };
  },
  template: `
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="issue" class="fixed inset-0 bg-black/55 z-40" @click="closeIssue"></div>
    </Transition>
    <Transition name="panel">
      <div v-if="issue" class="fixed top-0 right-0 h-full w-[520px] max-w-[92vw] bg-panel border-l border-bstrong shadow-panel z-50 flex flex-col">
        <div class="flex items-center gap-2.5 px-4 py-3.5 border-b border-border flex-none">
          <span class="font-mono text-accent text-[12px] tracking-wide">#{{ issue.id }}</span>
          <input ref="titleInput" :value="issue.title" @change="onFieldChange('title', $event.target.value)"
                 class="!bg-transparent !border-none text-base font-semibold flex-1 !p-0.5 !shadow-none">
          <button @click="markDone" class="bg-transparent border border-border px-2.5 py-1.5 text-dim hover:text-done hover:border-done/40 rounded-md text-[12px]">Done</button>
          <button @click="removeIssue" class="bg-transparent border border-border px-2.5 py-1.5 text-dim hover:text-critical hover:border-critical/40 rounded-md text-[12px]">Delete</button>
          <button @click="closeIssue" class="bg-transparent border-none px-1.5 py-1 text-dim hover:bg-surface2 rounded">Close</button>
        </div>
        <div class="flex gap-0.5 px-4 border-b border-border flex-none">
          <div v-for="[key,label] in TABS" :key="key" @click="ui.activeTab = key"
               :class="['px-2.5 py-2.5 text-[12px] cursor-pointer border-b-2 transition-colors',
                         ui.activeTab===key ? 'text-text border-accent' : 'text-dim border-transparent hover:text-text']">{{ label }}</div>
        </div>
      <div class="flex-1 overflow-y-auto p-4">

        <div v-if="ui.activeTab === 'basic'">
          <div class="mb-3.5">
            <label class="block text-[11px] text-dim mb-1">Register</label>
            <Select :model-value="issue.register || 'work'" @update:model-value="onFieldChange('register', $event)" :options="registerOptions" />
          </div>
          <div class="mb-3.5">
            <label class="block text-[11px] text-dim mb-1">Status</label>
            <Select :model-value="issue.status" @update:model-value="onFieldChange('status', $event)" :options="statusOptions" />
          </div>
          <div class="grid grid-cols-2 gap-2.5 mb-3.5">
            <div>
              <label class="block text-[11px] text-dim mb-1">Priority</label>
              <Select :model-value="issue.priority" @update:model-value="onFieldChange('priority', $event)" :options="priorityOptions" />
            </div>
            <div>
              <label class="block text-[11px] text-dim mb-1">Due date</label>
              <input type="date" :value="issue.dueDate || ''" @change="onFieldChange('dueDate', $event.target.value || null)">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2.5 mb-3.5">
            <div>
              <label class="block text-[11px] text-dim mb-1">Customer</label>
              <Select :model-value="issue.customerId || ''" @update:model-value="onFieldChange('customerId', $event || null)" :options="customerOptions" />
            </div>
            <div>
              <label class="block text-[11px] text-dim mb-1">Project</label>
              <Select :model-value="issue.projectId || ''" @update:model-value="onProjectChange($event || null)" :options="projectOptions" />
            </div>
          </div>
          <div class="mb-3.5">
            <label class="block text-[11px] text-dim mb-1">Tags</label>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="t in db.tags" :key="t.id" @click="toggleTag(t.id)"
                    :class="['text-[10px] px-1.5 py-px rounded-full border cursor-pointer',
                              (issue.tags||[]).includes(t.id) ? 'border-accent text-text bg-accentdim' : 'border-border text-dim bg-surface2']">
                {{ t.name }}
              </span>
            </div>
          </div>
          <div class="mb-3.5">
            <label class="block text-[11px] text-dim mb-1">Description</label>
            <div class="flex justify-end mb-1">
              <button @click="ui.previewMode.desc = !ui.previewMode.desc" class="bg-transparent border-none px-1.5 py-1 text-dim hover:bg-surface2 rounded text-[11px]">
                {{ ui.previewMode.desc ? 'Edit' : 'Preview' }}
              </button>
            </div>
            <div v-if="ui.previewMode.desc" class="md-preview bg-surface border border-border rounded-md px-3 py-2.5 min-h-[80px] text-[13px] leading-relaxed"
                 v-html="mdToHtml(issue.description) || '<span class=faint>No description.</span>'"></div>
            <textarea v-else rows="6" placeholder="Markdown description..." :value="issue.description"
                      @change="saveMarkdownField('description', 'desc', $event.target.value)"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="block text-[11px] text-dim mb-1">Created</label>
              <div class="font-mono text-faint text-[11px]">{{ fmtDateTime(issue.createdAt) }}</div>
            </div>
            <div>
              <label class="block text-[11px] text-dim mb-1">Updated</label>
              <div class="font-mono text-faint text-[11px]">{{ fmtDateTime(issue.updatedAt) }}</div>
            </div>
          </div>
        </div>

        <div v-else-if="ui.activeTab === 'notes'">
          <div class="flex justify-end mb-1">
            <button @click="ui.previewMode.notes = !ui.previewMode.notes" class="bg-transparent border-none px-1.5 py-1 text-dim hover:bg-surface2 rounded text-[11px]">
              {{ ui.previewMode.notes ? 'Edit' : 'Preview' }}
            </button>
          </div>
          <div v-if="ui.previewMode.notes" class="md-preview bg-surface border border-border rounded-md px-3 py-2.5 min-h-[80px] text-[13px] leading-relaxed"
               v-html="mdToHtml(issue.notes) || '<span class=faint>No notes.</span>'"></div>
          <textarea v-else rows="14" placeholder="## Todo&#10;- check API&#10;&#10;## SQL&#10;SELECT *" :value="issue.notes"
                    @change="saveMarkdownField('notes', 'notes', $event.target.value)"></textarea>
        </div>

        <div v-else-if="ui.activeTab === 'timeline'">
          <div v-for="e in timelineSorted()" :key="e.ts + e.text" class="timeline-entry">
            <div>
              <div class="font-mono text-[10px] text-faint whitespace-nowrap">{{ fmtDateTime(e.ts) }}</div>
              <div class="text-[12px] text-dim">{{ e.text }}</div>
            </div>
          </div>
          <div class="flex gap-1.5 mt-2.5">
            <input v-model="commentText" placeholder="Add a comment..." @keydown.enter="submitComment">
            <button @click="submitComment" class="bg-accent border-accent text-white px-2.5 py-1.5 rounded-md hover:bg-[#3f6bef] flex-none">Add</button>
          </div>
        </div>

        <div v-else-if="ui.activeTab === 'attachments'">
          <div @click="$refs.fileInput.click()"
               @dragover.prevent="dragOver = true" @dragleave="dragOver = false" @drop.prevent="onDrop"
               :class="['border-[1.5px] border-dashed rounded-md p-5 text-center text-[12px] cursor-pointer',
                         dragOver ? 'border-accent text-accent' : 'border-bstrong text-faint']">
            Drag &amp; drop files here, or click to browse<br>
            <span class="text-[11px]">Text files stored with preview. Other files stored by name only.</span>
          </div>
          <input ref="fileInput" type="file" multiple class="hidden" @change="onFilePick">
          <div class="mt-3">
            <div v-for="(a, idx) in issue.attachments" :key="idx" class="flex items-center gap-2 px-2 py-1.5 rounded-md bg-surface mb-1.5">
              <span class="flex-1 text-[12px]">{{ a.name }}</span>
              <span class="text-[10px] text-faint">{{ a.size ? Math.round(a.size/1024) + ' KB' : '' }}</span>
              <button @click="removeAttachment(idx)" class="bg-transparent border-none px-1.5 py-1 text-dim hover:text-critical">Remove</button>
            </div>
            <div v-if="!issue.attachments.length" class="text-faint text-[12px]">No attachments yet.</div>
          </div>
        </div>

        <div v-else-if="ui.activeTab === 'links'">
          <div v-for="(l, idx) in issue.links" :key="idx" class="flex items-center gap-2 px-2 py-1.5 rounded-md bg-surface mb-1.5">
            <span class="text-[10px] text-faint w-[70px] flex-none">{{ l.provider }}</span>
            <a :href="l.url" target="_blank" rel="noopener" class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-accent">{{ l.url }}</a>
            <button @click="removeLink(idx)" class="bg-transparent border-none px-1.5 py-1 text-dim hover:text-critical">Remove</button>
          </div>
          <div v-if="!issue.links.length" class="text-faint text-[12px] mb-2">No links yet.</div>
          <div class="flex gap-2">
            <div class="w-[130px] flex-none"><Select v-model="linkProvider" :options="LINK_PROVIDERS" /></div>
            <input v-model="linkUrl" placeholder="https://...">
            <button @click="addLink" class="bg-accent border-accent text-white px-2.5 py-1.5 rounded-md hover:bg-[#3f6bef] flex-none">Add</button>
          </div>
        </div>

      </div>
      </div>
    </Transition>
  </Teleport>
  `
};
