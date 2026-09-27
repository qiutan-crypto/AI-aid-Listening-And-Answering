// 统计 AI 用了多少 token，在终端里显示，方便对照 AI Studio 的用量和估算费用。
const totals = { requests: 0, cancelled: 0, input: 0, output: 0, thoughts: 0 };

/** 1234 → "1234"，12345 → "1.2万" */
function n(x) {
  return x >= 10000 ? (x / 10000).toFixed(1) + "万" : String(x);
}

/** @param {{input:number, output:number, thoughts:number}|null} usage */
export function recordUsage(usage) {
  totals.requests++;
  if (!usage) return;
  totals.input += usage.input;
  totals.output += usage.output;
  totals.thoughts += usage.thoughts;
}

/** 请求被取消了（后台准备的提示被更新的内容取代）：拿不到用量，但 AI 服务可能已经按输入计费 */
export function recordCancelled() {
  totals.cancelled++;
}

export function formatUsage(usage) {
  if (!usage) return "用量未知";
  return `输入 ${usage.input} / 输出 ${usage.output} / 思考 ${usage.thoughts}`;
}

export function formatTotals() {
  const t = totals;
  return `累计 ${t.requests} 次（另有 ${t.cancelled} 次中途取消）· 输入 ${n(t.input)} · 输出 ${n(t.output)} · 思考 ${n(t.thoughts)}`;
}
