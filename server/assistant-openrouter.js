import { assistantTools } from './assistant-tools.js';
import { requireAssistantConfig } from './assistant-config.js';
import { InputError } from './session-domain.js';

export function createOpenRouterResponder({ config = () => process.env, fetchImpl = fetch, now = () => new Date(), instructions } = {}) {
  return async ({ input, execute, signal }) => {
    const { apiKey, model, provider } = requireAssistantConfig(config());
    if (provider !== 'openrouter') throw new InputError('Cần chọn AI_PROVIDER=openrouter để dùng OpenRouter.', 503);
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now());
    const messages = [{ role: 'system', content: instructions(today) }, ...input];
    const tools = assistantTools.map(({ name, description, parameters }) => ({ type: 'function', function: { name, description, parameters } }));
    const sources = new Map(); let calls = 0;
    for (let round = 0; round < 4; round++) {
      let response;
      try {
        response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-OpenRouter-Title': 'KidIT Manager' },
          body: JSON.stringify({ model, messages, tools, tool_choice: round === 0 ? 'required' : 'auto', stream: false, max_tokens: 6000, reasoning: { enabled: true }, provider: { require_parameters: true } }),
        });
      } catch (error) {
        if (signal.aborted || error.name === 'TimeoutError') throw new InputError('AI phản hồi quá lâu hoặc yêu cầu đã dừng. Hãy thử câu hỏi ngắn hơn.', 504);
        throw new InputError('Không kết nối được OpenRouter. Hãy thử lại.', 502);
      }
      if (!response.ok) {
        const status = response.status;
        const message = status === 429 ? 'OpenRouter đang hết hạn mức hoặc quá tải. Hãy chờ rồi thử lại.'
          : status === 402 ? 'OpenRouter báo không đủ hạn mức. Hãy kiểm tra tài khoản và model.'
            : status === 404 ? 'Không có endpoint OpenRouter phù hợp cho model và công cụ tra cứu. Hãy kiểm tra model hoặc thử lại sau.'
              : 'Không gọi được OpenRouter. Hãy kiểm tra khóa API, tên model và quyền truy cập.';
        throw new InputError(message, status === 429 ? 429 : 502);
      }
      let payload;
      try { payload = await response.json(); } catch { throw new InputError('OpenRouter trả về dữ liệu không hợp lệ.', 502); }
      const choice = payload.choices?.[0]; const message = choice?.message;
      if (payload.error || !message || message.role !== 'assistant' || !['stop', 'tool_calls'].includes(choice.finish_reason)) throw new InputError('AI chưa hoàn tất câu trả lời hoặc không gọi được công cụ. Hãy thu hẹp câu hỏi hoặc kiểm tra model.', 502);
      const requested = message.tool_calls ?? [];
      if (!Array.isArray(requested)) throw new InputError('OpenRouter trả về yêu cầu công cụ không hợp lệ.', 502);
      if (!requested.length) {
        if (choice.finish_reason !== 'stop' || calls === 0 || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 16000) throw new InputError('Model chưa tra dữ liệu hoặc chưa trả lời đầy đủ. Hãy thử lại hoặc chọn model hỗ trợ gọi công cụ.', 502);
        return { answer: message.content.trim(), sources: [...sources.values()].slice(0, 120), checked_at: now().toISOString() };
      }
      if (round === 3 || calls + requested.length > 6) throw new InputError('Câu hỏi cần quá nhiều bước tra cứu. Hãy hỏi riêng từng lớp hoặc khoảng ngày.', 422);
      if (choice.finish_reason !== 'tool_calls' || requested.some(call => call.type !== 'function' || typeof call.id !== 'string' || !call.id || !call.function || typeof call.function.name !== 'string' || typeof call.function.arguments !== 'string') || new Set(requested.map(c => c.id)).size !== requested.length) throw new InputError('Model trả về yêu cầu công cụ không hợp lệ. Hãy thử lại.', 502);
      // Preserve signed/opaque reasoning details exactly for the tool continuation, server-side only.
      messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: requested, ...(message.reasoning_details ? { reasoning_details: message.reasoning_details } : {}) });
      for (const call of requested) {
        calls++; let output;
        try {
          const result = await execute(call.function.name, JSON.parse(call.function.arguments));
          for (const source of result.sources) sources.set(`${source.href}/${source.date || ''}/${source.start_time || ''}/${source.end_time || ''}`, source);
          output = result.data;
        } catch (error) {
          if (!(error instanceof InputError) && !(error instanceof SyntaxError)) throw error;
          output = { error: error instanceof SyntaxError ? 'Tham số JSON không hợp lệ.' : error.message };
        }
        const content = JSON.stringify(output);
        if (content.length > 150000) throw new InputError('Kết quả quá lớn. Hãy thu hẹp khoảng ngày hoặc chọn một lớp.', 422);
        messages.push({ role: 'tool', tool_call_id: call.id, content });
      }
    }
  };
}
