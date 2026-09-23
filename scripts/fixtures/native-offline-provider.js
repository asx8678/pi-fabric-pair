import fs from 'node:fs';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';

export default function nativeOfflineProvider(pi) {
  let issued = false;
  const scenario = process.env.PAIR_NATIVE_SCENARIO || 'provider';
  const log = value => {
    if (process.env.PAIR_NATIVE_LOG) fs.appendFileSync(process.env.PAIR_NATIVE_LOG, `${JSON.stringify(value)}\n`);
  };
  pi.on('tool_call', event => { log({ type: 'tool_call', toolName: event.toolName, toolCallId: event.toolCallId }); });
  pi.on('tool_result', event => { log({ type: 'tool_result', toolName: event.toolName, toolCallId: event.toolCallId, isError: event.isError, content: event.content }); });
  pi.registerProvider('pair-native-offline', {
    api: 'pair-native-offline-api', baseUrl: 'http://offline.invalid', apiKey: 'offline-fixture-not-a-secret',
    models: [{ id: 'fixture', name: 'Pair deterministic native fixture', reasoning: false, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 4096 }],
    streamSimple(model, _context, options) {
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const message = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, content: [], timestamp: Date.now(), stopReason: 'pending',
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
        stream.push({ type: 'start', partial: message });
        if (!issued && !options?.signal?.aborted) {
          issued = true;
          const authority = JSON.parse(fs.readFileSync(`${process.env.PI_FABRIC_PAIR_WORKER_DIR}/authority.json`, 'utf8'));
          const report = { taskId: authority.task.id, stepId: authority.task.steps[authority.task.stepIndex].id,
            kind: 'final_review', summary: `Deterministic native ${scenario} regression probe.` };
          const code = ['background', 'implicit-background'].includes(scenario)
            ? `const job = await pi.bash({cmd: 'sleep 5; printf late-change > late.txt'${scenario === 'background' ? ', background: true' : ''}}); await tools.call({ref: 'extensions.pair_report', args: ${JSON.stringify(report)}}); return job;`
            : `const before = await tools.call({ref: 'state.transition', args: {label: 'before-report', to: 'before', summary: 'read-only worker mutation probe'}}); await tools.call({ref: 'extensions.pair_report', args: ${JSON.stringify(report)}}); const after = await tools.call({ref: 'state.transition', args: {label: 'after-report', from: 'before', to: 'after', summary: 'closed-grant mutation probe'}}); return {before, after};`;
          const block = { type: 'toolCall', id: `pair_native_${scenario}_1`, name: 'fabric_exec', arguments: { code } };
          message.content.push(block);
          stream.push({ type: 'toolcall_start', contentIndex: 0, partial: message });
          stream.push({ type: 'toolcall_delta', contentIndex: 0, delta: JSON.stringify(block.arguments), partial: message });
          stream.push({ type: 'toolcall_end', contentIndex: 0, toolCall: block, partial: message });
          message.stopReason = 'toolUse';
        } else {
          const block = { type: 'text', text: 'Deterministic probe finished.' }; message.content.push(block);
          stream.push({ type: 'text_start', contentIndex: 0, partial: message });
          stream.push({ type: 'text_delta', contentIndex: 0, delta: block.text, partial: message });
          stream.push({ type: 'text_end', contentIndex: 0, content: block.text, partial: message });
          message.stopReason = 'stop';
        }
        stream.push({ type: 'done', reason: message.stopReason, message }); stream.end();
      });
      return stream;
    }
  });
}
