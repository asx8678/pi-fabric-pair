import { assert, plain, safeId } from './util.js';
// Standard JSON Schema is also a valid TypeBox schema. No runtime dependency is needed.
const string = (description, maxLength = 24000) => ({ type: 'string', description, minLength: 1, maxLength });
const array = (items, maxItems = 64) => ({ type: 'array', items, maxItems });
const object = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
const enumOf = values => ({ type: 'string', enum: values });
export const stepSchema = object({ id: string('Stable step ID', 80), title: string('Step title', 200), instructions: string('Bounded implementation instructions'), acceptance: array(string('Acceptance criterion', 2000)) }, ['id', 'title', 'instructions']);
export const dispatchSchema = object({
  workerId: string('Configured worker ID', 80), requestId: string('Idempotency key; reuse only to retry the identical assignment', 80),
  objective: string('Task goal', 6000), constraints: array(string('Mandatory constraint', 2000)),
  context: string('Relevant facts, decisions and repository references; not the whole Main transcript'),
  steps: { ...array(stepSchema, 32), minItems: 1 }
}, ['workerId', 'requestId', 'objective', 'steps']);
export const reportSchema = object({
  taskId: string('Current task ID', 80), stepId: string('Current step ID', 80),
  kind: enumOf(['question', 'checkpoint', 'blocked', 'final_review']),
  summary: string('What changed, why, or what is blocking progress', 8000),
  question: string('Question that Main must answer', 4000),
  decisions: array(string('Important decision', 2000), 24),
  changedFiles: array(string('Changed path', 1024), 200),
  checks: array(object({ name: string('Check name', 200), result: enumOf(['pass', 'fail', 'not_run']), detail: string('Evidence; explicitly worker-reported', 2000) }, ['name', 'result']), 32),
  stepComplete: { type: 'boolean', description: 'False for an intermediate checkpoint; final_review always completes the task.' }
}, ['taskId', 'stepId', 'kind', 'summary']);
export const decisionSchema = object({
  workerId: string('Configured worker ID', 80), taskId: string('Task ID', 80), reportId: string('The exact report being answered/reviewed', 80),
  action: enumOf(['answer', 'approve', 'revise', 'cancel']),
  feedback: string('Answer, concrete changes required, or review rationale', 12000),
  checkpointHash: string('Exact current checkpoint hash, required for approval', 64)
}, ['workerId', 'taskId', 'reportId', 'action', 'feedback']);
export const inspectSchema = object({ workerId: string('Worker ID', 80), reportId: string('Report ID; omit for latest', 80), file: string('Optional changed path to read from immutable evidence', 1024) }, ['workerId']);
export const statusSchema = object({}, []);
export function validate(schema, value, label = 'input') {
  if (schema.enum) { assert(schema.enum.includes(value), `${label}: choose ${schema.enum.join(', ')}`); return value; }
  if (schema.type === 'object') {
    assert(plain(value), `${label} must be an object`);
    for (const key of schema.required || []) assert(Object.hasOwn(value, key), `${label}.${key} is required`);
    for (const [key, v] of Object.entries(value)) { assert(Object.hasOwn(schema.properties, key), `${label}.${key} is not allowed`); validate(schema.properties[key], v, `${label}.${key}`); }
  } else if (schema.type === 'array') {
    assert(Array.isArray(value), `${label} must be an array`);
    assert(value.length >= (schema.minItems || 0) && value.length <= (schema.maxItems ?? Infinity), `${label}: invalid number of items`);
    value.forEach((v, i) => validate(schema.items, v, `${label}[${i}]`));
  } else if (schema.type === 'string') {
    assert(typeof value === 'string' && value.length >= (schema.minLength || 0) && value.length <= (schema.maxLength ?? Infinity), `${label}: invalid string length`);
  } else if (schema.type === 'boolean') assert(typeof value === 'boolean', `${label} must be boolean`);
  return value;
}
export function validateDispatch(input) {
  validate(dispatchSchema, input); assert(JSON.stringify(input).length <= 64000, 'Work order is too large; use concise instructions and repository references (64 KB maximum)'); safeId(input.workerId, 'workerId'); safeId(input.requestId, 'requestId');
  const ids = new Set(); for (const step of input.steps) { safeId(step.id, 'step.id'); assert(!ids.has(step.id), 'Step IDs must be unique'); ids.add(step.id); }
  return input;
}
export function validateReport(input) {
  validate(reportSchema, input); safeId(input.taskId, 'taskId'); safeId(input.stepId, 'stepId');
  if (input.kind === 'question') assert(input.question?.trim(), 'question reports need a question');
  return input;
}
export function validateDecision(input) {
  validate(decisionSchema, input); for (const key of ['workerId', 'taskId', 'reportId']) safeId(input[key], key);
  if (input.action === 'approve') assert(/^[a-f0-9]{64}$/.test(input.checkpointHash || ''), 'Approval requires the exact checkpointHash');
  return input;
}
