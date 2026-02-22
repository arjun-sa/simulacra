import type { TopologyConfig } from '../types.js';
import { isTopologyConfig } from '../types.js';

const SYSTEM_PROMPT = [
  'Return ONLY JSON matching TopologyConfig.',
  'No markdown, no explanation, no prose.',
  'Use only node types: producer,kafka,worker,database,postgresql,mongodb,cassandra,elasticsearch,cache,redis,rabbitmq,s3,rate_limiter,load_balancer,api_gateway,circuit_breaker,dead_letter_queue,consumer_group.',
  'Include nodes[] and edges[] arrays.',
  'Each node must include id,type,label,x,y.',
  'Use left-to-right tiered layout (x increases per tier).'
].join(' ');

const RETRY_PROMPT = `${SYSTEM_PROMPT} Ensure all edges reference valid node ids and all numeric fields are numbers.`;

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

async function callAnthropic(prompt: string, apiKey: string, systemPrompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1400,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Anthropic call failed (${res.status}): ${details.slice(0, 200)}`);
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.find((item) => item.type === 'text')?.text;
  if (!text) throw new Error('Anthropic response missing text content');
  return text;
}

function parseTopology(raw: string): TopologyConfig | null {
  try {
    const parsed = JSON.parse(stripFences(raw));
    return isTopologyConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function generateTopology(prompt: string, apiKey: string): Promise<TopologyConfig> {
  const first = parseTopology(await callAnthropic(prompt, apiKey, SYSTEM_PROMPT));
  if (first) return first;

  const second = parseTopology(await callAnthropic(prompt, apiKey, RETRY_PROMPT));
  if (second) return second;

  throw new Error('Model did not return valid TopologyConfig JSON');
}
