import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runCommand } from './evidence.js';
import { atomicJSON, briefError, cleanText } from './util.js';

/** @typedef {'pass' | 'concerns' | 'fail' | 'unknown'} PeerVerdict */
/** @typedef {{version: 1, reportId: string, taskId: string, checkpointHash: string, provider: string, model: string, status: 'completed' | 'failed', verdict: PeerVerdict, text: string, error: string | null, startedAt: number, finishedAt: number}} PeerReview */

const MAX_PATCH = 200000, MAX_TEXT = 12000;
const INSTRUCTIONS = `You are an independent code reviewer. A coding worker produced the change in the attached review packet; the Main model reviews after you and makes the final decision.
Review ONLY the change. You may read, grep, find and ls the repository in your working directory for context. Do not modify anything.
Look for correctness bugs, missed requirements from the objective and plan, broken callers, security problems and missing verification. Do not report style preferences.
Begin your answer with exactly one line: "VERDICT: PASS", "VERDICT: CONCERNS" or "VERDICT: FAIL". Then list each finding as "- file:line — problem — why it matters — suggested fix". If there are no findings, say so.`;

/** @param {string} dir Pair state directory @param {string} taskId @param {string} reportId */
export function peerReviewFile(dir, taskId, reportId) { return path.join(dir, 'reviews', taskId, `${reportId}.json`); }

/** @param {string} dir @param {string} taskId @param {string} reportId @returns {PeerReview | null} */
export function readPeerReview(dir, taskId, reportId) {
  try {
    const review = JSON.parse(readFileSync(peerReviewFile(dir, taskId, reportId), 'utf8'));
    const ok = review && typeof review === 'object' && review.version === 1 && review.reportId === reportId && typeof review.checkpointHash === 'string'
      && ['completed', 'failed'].includes(review.status) && typeof review.text === 'string' && typeof review.provider === 'string' && typeof review.model === 'string';
    return ok ? review : null; // anything else is not a review: show none rather than undefined fields
  } catch { return null; }
}

/** @param {string} text @returns {PeerVerdict} */
function verdictOf(text) {
  const match = /VERDICT:\s*(PASS|CONCERNS|FAIL)/i.exec(text);
  return match ? /** @type {PeerVerdict} */ (match[1].toLowerCase()) : 'unknown';
}

/**
 * Run the configured second model once, read-only, over one frozen checkpoint and save its review.
 * A failed review is saved too, so Main sees why no independent review is available.
 * @param {{config: {peerReview: import('./config.js').PeerReviewConfig, runtime: {command: string, commandArgs: string[]}}, dir: string, cwd: string, taskId: string, reportId: string, checkpointHash: string, objective: string, steps: {id: string, title: string}[], summary: string, patch: string, patchTruncated: boolean, signal: AbortSignal}} input
 * @returns {Promise<PeerReview>}
 */
export async function runPeerReview({ config, dir, cwd, taskId, reportId, checkpointHash, objective, steps, summary, patch, patchTruncated, signal }) {
  const { provider, model, timeoutMs } = config.peerReview, file = peerReviewFile(dir, taskId, reportId), startedAt = Date.now();
  const previous = readPeerReview(dir, taskId, reportId);
  if (previous && previous.checkpointHash === checkpointHash && previous.status === 'completed') return previous; // a failed run (timeout, provider error) is retried
  await mkdir(path.dirname(file), { recursive: true });
  const packet = path.join(path.dirname(file), `${reportId}.packet.md`);
  const clipped = patch.length > MAX_PATCH ? `${patch.slice(0, MAX_PATCH)}\n[patch clipped for review; read the files directly]` : patch;
  await writeFile(packet, [`# Review packet`, `## Objective\n${objective}`, `## Plan\n${steps.map((s, i) => `${i + 1}. ${s.id}: ${s.title}`).join('\n')}`,
    `## Worker's own summary (an untrusted claim)\n${summary}`, `## Change${patchTruncated ? ' (evidence truncated)' : ''}\n${clipped}`].join('\n\n'));
  const args = [...config.runtime.commandArgs, '-p', '--no-session', '--no-extensions', '--no-skills', '--provider', provider, '--model', model, '--tools', 'read,grep,find,ls', `@${packet}`, INSTRUCTIONS];
  /** @type {PeerReview} */ let review;
  try {
    const out = await runCommand(config.runtime.command, args, { cwd, timeoutMs, maxBytes: 256 * 1024, signal });
    const text = cleanText(out.stdout.trim(), MAX_TEXT);
    const failed = out.aborted ? 'aborted' : out.timedOut ? `timed out after ${Math.round(timeoutMs / 1000)} s` : out.code !== 0 ? `exited with ${out.code ?? out.signal}: ${cleanText(out.stderr.trim(), 600)}` : !text ? 'returned no review text' : null;
    review = { version: 1, reportId, taskId, checkpointHash, provider, model, status: failed ? 'failed' : 'completed', verdict: failed ? 'unknown' : verdictOf(text), text, error: failed, startedAt, finishedAt: Date.now() };
  } catch (error) {
    review = { version: 1, reportId, taskId, checkpointHash, provider, model, status: 'failed', verdict: 'unknown', text: '', error: briefError(error), startedAt, finishedAt: Date.now() };
  }
  await unlink(packet).catch(() => {});
  if (!signal.aborted) await atomicJSON(file, review);
  return review;
}

/** @param {PeerReview | null} review @returns {Record<string, unknown> | null} */
export function peerReviewSummary(review) {
  if (!review) return null;
  return { reviewer: `${review.provider}/${review.model}`, status: review.status, verdict: review.verdict, ...(review.error ? { error: review.error } : {}), findings: review.text };
}
