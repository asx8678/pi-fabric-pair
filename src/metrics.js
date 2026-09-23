export function normalizedUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const finite = key => Number.isFinite(usage[key]) && usage[key] >= 0 ? usage[key] : 0;
  const input = finite('input'), cacheRead = finite('cacheRead'), cacheWrite = finite('cacheWrite'), output = finite('output');
  const totalInput = input + cacheRead + cacheWrite;
  const cost = usage.cost && Number.isFinite(usage.cost.total) && usage.cost.total >= 0 ? usage.cost.total : null;
  return { input, cacheRead, cacheWrite, totalInput, output, cacheRatio: totalInput ? cacheRead / totalInput : null, cost, observedAt: Date.now() };
}
export function addUsage(total = {}, usage) {
  total ||= {};
  const out = { ...total };
  for (const key of ['input', 'cacheRead', 'cacheWrite', 'totalInput', 'output']) out[key] = (total[key] || 0) + usage[key];
  out.reportedCost = (total.reportedCost || 0) + (usage.cost || 0);
  out.unknownCostRequests = (total.unknownCostRequests || 0) + (usage.cost === null ? 1 : 0);
  out.requests = (total.requests || 0) + 1;
  out.cacheRatio = out.totalInput ? out.cacheRead / out.totalInput : null;
  return out;
}
export function limitExceeded(task, limits) {
  if (task.turns >= limits.maxTurnsPerStep) return 'Per-step model turn limit reached';
  if (limits.maxReportedCostUsd !== null && (task.usage?.reportedCost || 0) >= limits.maxReportedCostUsd) return 'Reported inference-cost budget reached';
  if (limits.maxOutputTokens !== null && (task.usage?.output || 0) >= limits.maxOutputTokens) return 'Output-token budget reached';
  if (Date.now() - task.startedAt >= limits.taskTimeoutMs) return 'Task duration limit reached';
  return null;
}
