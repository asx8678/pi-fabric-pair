import { assert, plain, safeId } from './util.js';
import { validateReportPayload } from './contracts.js';
/** @typedef {import('./contracts.js').Step} Step */
/** @typedef {import('./contracts.js').ReportPayload} ReportPayload */
/** @typedef {{workerId: string, requestId: string, objective: string, constraints?: string[], context?: string, steps: Step[]}} DispatchPayload */
/** @typedef {{workerId: string, taskId: string, reportId: string, action: 'answer' | 'approve' | 'revise' | 'cancel', feedback: string, checkpointHash?: string}} DecisionShape */
/** @typedef {DecisionShape & ({action: 'approve', checkpointHash: string} | {action: 'answer' | 'revise' | 'cancel'})} DecisionPayload */

// The JSON Schema subset understood by validate; these types add no schema fields.
/** @typedef {{description?: string, enum?: readonly unknown[]}} SchemaOptions */
/** @typedef {SchemaOptions & {type: 'string', minLength?: number, maxLength?: number}} StringSchema */
/** @typedef {SchemaOptions & {type: 'boolean'}} BooleanSchema */
/** @typedef {SchemaOptions & {type: 'array', items: Schema, minItems?: number, maxItems?: number}} ArraySchema */
/** @typedef {SchemaOptions & {type: 'object', properties: Record<string, Schema>, required?: readonly string[], additionalProperties?: boolean}} ObjectSchema */
/** @typedef {StringSchema | BooleanSchema | ArraySchema | ObjectSchema} Schema */

// Standard JSON Schema is also a valid TypeBox schema. No runtime dependency is needed.
/** @param {string} description @param {number} [maxLength] @returns {{type: 'string', description: string, minLength: 1, maxLength: number}} */
const string = (description, maxLength = 24000) => ({ type: 'string', description, minLength: 1, maxLength });
/** @template {Schema} Item @param {Item} items @param {number} [maxItems] @returns {{type: 'array', items: Item, maxItems: number}} */
const array = (items, maxItems = 64) => ({ type: 'array', items, maxItems });
/** @template {Record<string, Schema>} Properties @template {keyof Properties & string} Key @param {Properties} properties @param {Key[]} required @returns {{type: 'object', properties: Properties, required: Key[], additionalProperties: false}} */
const object = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
/** @template {string} Value @param {Value[]} values @returns {{type: 'string', enum: Value[]}} */
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
export const yieldSchema = object({}, []);
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) { return plain(value); }
/** @param {unknown} value @returns {value is unknown[]} */
function isArray(value) { return Array.isArray(value); }

/** @param {Schema} schema @param {unknown} value @param {string} [label] @returns {unknown} */
export function validate(schema, value, label = 'input') {
  if (schema.enum) { assert(schema.enum.includes(value), `${label}: choose ${schema.enum.join(', ')}`); return value; }
  if (schema.type === 'object') {
    assert(isObject(value), `${label} must be an object`);
    for (const key of schema.required || []) assert(Object.hasOwn(value, key), `${label}.${key} is required`);
    for (const [key, v] of Object.entries(value)) { assert(Object.hasOwn(schema.properties, key), `${label}.${key} is not allowed`); validate(schema.properties[key], v, `${label}.${key}`); }
    // Decoded JSON has enumerable own fields, but callers can supply objects
    // with inherited or non-enumerable declared fields. Check those too.
    for (const [key, fieldSchema] of Object.entries(schema.properties)) {
      if (!(key in value)) continue;
      assert(Object.hasOwn(value, key), `${label}.${key} must be an own property`);
      if (!Object.prototype.propertyIsEnumerable.call(value, key)) validate(fieldSchema, value[key], `${label}.${key}`);
    }
  } else if (schema.type === 'array') {
    assert(isArray(value), `${label} must be an array`);
    assert(value.length >= (schema.minItems || 0) && value.length <= (schema.maxItems ?? Infinity), `${label}: invalid number of items`);
    // forEach skips holes; every slot must be present and validated.
    for (let i = 0; i < value.length; i++) {
      assert(Object.hasOwn(value, i), `${label}[${i}] is required`);
      validate(schema.items, value[i], `${label}[${i}]`);
    }
  } else if (schema.type === 'string') {
    assert(typeof value === 'string' && value.length >= (schema.minLength || 0) && value.length <= (schema.maxLength ?? Infinity), `${label}: invalid string length`);
  } else if (schema.type === 'boolean') assert(typeof value === 'boolean', `${label} must be boolean`);
  return value;
}

// Each shape assertion validates every required and optional field through the
// corresponding public schema, including nested steps/acceptance and enums.
// Keep the original object: copying/defaulting would change idempotency hashes.
/** @param {unknown} input @returns {asserts input is DispatchPayload} */
function assertDispatchShape(input) { validate(dispatchSchema, input); }
/** @param {unknown} input @returns {asserts input is DecisionShape} */
function assertDecisionShape(input) { validate(decisionSchema, input); }
/** @param {unknown} input @returns {asserts input is DecisionPayload} */
function assertDecisionPayload(input) {
  assertDecisionShape(input); safeId(input.workerId, 'workerId'); safeId(input.taskId, 'taskId'); safeId(input.reportId, 'reportId');
  if (input.action === 'approve') assert(/^[a-f0-9]{64}$/.test(input.checkpointHash || ''), 'Approval requires the exact checkpointHash');
}

/** @param {unknown} input @returns {DispatchPayload} */
export function validateDispatch(input) {
  assertDispatchShape(input); assert(JSON.stringify(input).length <= 64000, 'Work order is too large; use concise instructions and repository references (64 KB maximum)'); safeId(input.workerId, 'workerId'); safeId(input.requestId, 'requestId');
  /** @type {Set<string>} */
  const ids = new Set(); for (const step of input.steps) { safeId(step.id, 'step.id'); assert(!ids.has(step.id), 'Step IDs must be unique'); ids.add(step.id); }
  return input;
}
/** @param {unknown} input @returns {ReportPayload} */
export function validateReport(input) { return validateReportPayload(input); }
/** @param {unknown} input @returns {DecisionPayload} */
export function validateDecision(input) { assertDecisionPayload(input); return input; }
