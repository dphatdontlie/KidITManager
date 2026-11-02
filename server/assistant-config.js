import { InputError } from './session-domain.js';

export const OPENROUTER_DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';

export function assistantConfig(env) {
  const provider = env.AI_PROVIDER?.trim() || (env.OPENROUTER_API_KEY?.trim() ? 'openrouter' : 'openai');
  if (!['openai', 'openrouter'].includes(provider)) return { provider, configured: false };
  const apiKey = (provider === 'openrouter' ? env.OPENROUTER_API_KEY : env.OPENAI_API_KEY)?.trim();
  const model = (provider === 'openrouter' ? env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL : env.OPENAI_MODEL)?.trim();
  return { provider, apiKey, model, configured: Boolean(apiKey && model) };
}

export function requireAssistantConfig(env) {
  const settings = assistantConfig(env);
  if (!settings.configured) throw new InputError(settings.provider === 'openrouter'
    ? 'Chatbot chưa được cấu hình. Cần đặt OPENROUTER_API_KEY và OPENROUTER_MODEL trên máy chủ.'
    : 'Chatbot chưa được cấu hình. Kiểm tra AI_PROVIDER và khóa API, tên mô hình tương ứng trên máy chủ.', 503);
  return settings;
}
