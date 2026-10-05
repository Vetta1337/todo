// Pure domain operations shared by the Vue store and server integration.
export function makeIssue(input, { id, now, register = 'work', projects = [] }) {
  const selectedRegister = input.register || register;
  return {
    id, title: input.title || 'Untitled issue', description: input.description || '',
    status: input.status || 'inbox', priority: input.priority || 'medium', register: selectedRegister,
    customerId: input.customerId || null,
    projectId: projects.some(p => p.id === input.projectId && (p.register || 'work') === selectedRegister) ? input.projectId : null,
    tags: [], createdAt: now, updatedAt: now, dueDate: null, notes: '',
    timeline: [{ ts: now, type: 'created', text: 'Issue created' }], attachments: [], links: []
  };
}

export function patchIssue(issue, patch, { now, statuses, priorities }) {
  const oldStatus = issue.status, oldPriority = issue.priority;
  Object.assign(issue, patch);
  issue.updatedAt = now;
  issue.timeline ||= [];
  if (patch.status && patch.status !== oldStatus) {
    const status = statuses.find(s => s.key === patch.status) || statuses[0];
    issue.timeline.push({ ts: now, type: 'status', text: 'Status changed to ' + (status?.label || patch.status) });
    if (patch.status === 'done') issue.timeline.push({ ts: now, type: 'completed', text: 'Marked as done' });
  }
  if (patch.priority && patch.priority !== oldPriority) {
    const priority = priorities.find(p => p.key === patch.priority) || priorities[priorities.length - 1];
    issue.timeline.push({ ts: now, type: 'priority', text: 'Priority changed to ' + (priority?.label || patch.priority) });
  }
  return issue;
}

export function issueIsOverdue(issue, today) {
  return !!issue.dueDate && issue.status !== 'done' && issue.status !== 'archived' && issue.dueDate < today;
}
