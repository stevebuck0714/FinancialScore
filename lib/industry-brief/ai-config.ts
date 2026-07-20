import { getAiTransport } from '@/lib/ai-gateway';

function requiredEnv(name: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required for Daily Industry Brief.`);
  return value;
}

export function getIndustryBriefAiConfig() {
  return {
    transport: getAiTransport(),
    finalModel: requiredEnv('OPENAI_MODEL_INDUSTRY_BRIEF_FINAL'),
    scanModel: requiredEnv('OPENAI_MODEL_INDUSTRY_BRIEF_SCAN'),
  };
}
