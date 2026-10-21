#!/usr/bin/env node
// A stand-in for the low CLI with the same inbox protocol as low --serve / low --send (low's src/serve.rs).
// FAKE_LOW_RESULTS names a JSON file with one entry per task, in order: {result, delayMs, what, plan, stuck, lateSteers}.
// A task that is aborted while it waits returns low's stopped result. While a task waits the server keeps status.json
// in the inbox as low does: `what` is the run under way, `plan` low's plan, `stuck` keeps `moved` at the task's start,
// and `lateSteers` leaves steers untaken (the result counts them as dropped). FAKE_LOW_NO_STATUS=1 writes no status
// file, as an older low. Every task, steer and abort is appended to $HOME/fake-low.jsonl.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), home = process.env.HOME;
const sessions = path.join(home, '.low', 'sessions');
const log = entry => fs.appendFileSync(path.join(home, 'fake-low.jsonl'), `${JSON.stringify({ ...entry, at: Date.now() })}\n`);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function serve() {
  fs.mkdirSync(sessions, { recursive: true });
  const resumed = flag('--session'), id = resumed || `${Date.now()}-${process.pid}`;
  const file = path.join(sessions, `${id}.jsonl`), inbox = file.replace(/\.jsonl$/, '.inbox');
  if (!resumed) fs.writeFileSync(file, `${JSON.stringify({ id, cwd: process.cwd(), model: flag('-m'), effort: flag('--effort') })}\n`);
  log({ kind: 'serve', args, id });
  fs.rmSync(inbox, { recursive: true, force: true }); fs.mkdirSync(inbox, { recursive: true });
  if (!resumed) process.stderr.write(`[session ${file}]\n`);
  const plan = process.env.FAKE_LOW_RESULTS ? JSON.parse(fs.readFileSync(process.env.FAKE_LOW_RESULTS, 'utf8')) : [];
  let next = 0, served = 0;
  const status = value => {
    if (process.env.FAKE_LOW_NO_STATUS) return;
    fs.writeFileSync(path.join(inbox, 'status.part'), JSON.stringify({ ...value, at: Date.now(), pid: process.pid }));
    fs.renameSync(path.join(inbox, 'status.part'), path.join(inbox, 'status.json'));
  };
  let idle = { state: 'idle', tasks: 0 };
  status(idle);
  for (;;) {
    const tasks = fs.readdirSync(inbox).filter(n => n.endsWith('.task')).sort();
    if (!tasks.length) { status(idle); await sleep(50); continue; }
    const name = tasks[0].slice(0, -5), task = JSON.parse(fs.readFileSync(path.join(inbox, tasks[0]), 'utf8')).task;
    fs.rmSync(path.join(inbox, tasks[0]));
    if (task === '/stop') { fs.writeFileSync(path.join(inbox, `${name}.result`), JSON.stringify({ stopped: true, status: 'stopped server', exit: 0 })); log({ kind: 'stop' }); await sleep(200); fs.rmSync(inbox, { recursive: true, force: true }); process.exit(0); }
    log({ kind: 'task', task });
    fs.appendFileSync(file, `${JSON.stringify({ role: 'user', content: task })}\n`);
    const step = plan[next++] || { result: { status: 'done', exit: 0, verdict: 'NO CHANGES', good: true, answer: 'Nothing to do.', changes: [] } };
    let reply = { session: file, id, ...step.result };
    const began = Date.now(), end = began + (step.delayMs || 0), steers = { pending: 0, taken: 0 };
    let moved = began;
    fs.appendFileSync(file, `${JSON.stringify({ role: 'assistant', tool_calls: [{ id: 'c1' }] })}\n`);
    while (Date.now() < end) {
      for (const n of fs.readdirSync(inbox).filter(n => n.endsWith('.steer') || n.endsWith('.abort')).sort()) {
        const text = JSON.parse(fs.readFileSync(path.join(inbox, n), 'utf8')).text; fs.rmSync(path.join(inbox, n));
        if (n.endsWith('.abort')) { log({ kind: 'abort' }); reply = { session: file, id, status: 'stopped', exit: 5, verdict: 'STOPPED', good: false, answer: null, changes: [] }; }
        else if (step.lateSteers) { log({ kind: 'steer', text }); steers.pending++; }
        else { log({ kind: 'steer', text }); steers.taken++; moved = Date.now(); fs.appendFileSync(file, `${JSON.stringify({ role: 'user', content: text, meta: { steer: true } })}\n`); }
      }
      if (!step.stuck) moved = Date.now();
      status({ state: 'running', task: task.slice(0, 300), ms: Date.now() - began, activity: 'running code', step: 1, running: { what: step.what || 'print("working")', ms: Date.now() - began },
        intent: 'Working on it.', plan: step.plan || null, requests: 1, tokens: { prompt: 100, cached: 0, out: 10 }, steers: { ...steers }, moved });
      if (reply.exit === 5) break;
      await sleep(50);
    }
    fs.appendFileSync(file, `${JSON.stringify({ role: 'assistant', content: 'done' })}\n`);
    if (reply.exit !== 5) reply.steers = { taken: steers.taken, dropped: steers.pending };
    idle = { state: 'idle', tasks: ++served, since: Date.now(), last: { status: reply.status, exit: reply.exit, verdict: reply.verdict } };
    status(idle);
    fs.writeFileSync(path.join(inbox, `${name}.part`), JSON.stringify(reply));
    fs.renameSync(path.join(inbox, `${name}.part`), path.join(inbox, `${name}.result`));
  }
}

async function send() {
  const id = flag('--session'), task = args[args.length - 1];
  log({ kind: 'send', args });
  // As low does: --send takes only a task, --session and --json.
  if (args.some(a => a.startsWith('-') && !['--send', '--session', '--json'].includes(a) && a !== task)) { process.stderr.write('error: --send takes only a task\n'); process.exit(2); }
  const inbox = path.join(sessions, `${id}.inbox`);
  if (!fs.existsSync(inbox)) { process.stderr.write(`error: session ${id} is not served\n`); process.exit(3); }
  const name = `${String(process.hrtime.bigint()).padStart(24, '0')}-${process.pid}`;
  const control = task === '/abort' ? ['abort', ''] : task.startsWith('/steer ') ? ['steer', task.slice(7).trim()] : null;
  if (control) {
    fs.writeFileSync(path.join(inbox, `${name}.${control[0]}`), JSON.stringify({ text: control[1] }));
    process.stdout.write(`${JSON.stringify({ status: `${control[0]} sent`, exit: 0 })}\n`); return;
  }
  fs.writeFileSync(path.join(inbox, `${name}.task`), JSON.stringify({ task }));
  const done = path.join(inbox, `${name}.result`);
  for (;;) {
    if (fs.existsSync(done)) { const text = fs.readFileSync(done, 'utf8'); fs.rmSync(done); process.stdout.write(`${text.trim()}\n`); process.exit(JSON.parse(text).exit ?? 3); }
    if (!fs.existsSync(inbox)) { process.stderr.write('error: the low --serve stopped before it answered\n'); process.exit(3); }
    await sleep(50);
  }
}

if (args.includes('--serve')) await serve();
else if (args.includes('--send')) await send();
else { process.stderr.write('fake low: --serve or --send only\n'); process.exit(2); }
