import { NextRequest, NextResponse } from 'next/server';
import { describeAiConfig, getAiTransport, getOpenAiClient } from '@/lib/ai-gateway';
import { createModelText } from '@/lib/openai-helpers';

export async function GET(_request: NextRequest) {
  try {
    const transport = getAiTransport();
    const cfg = describeAiConfig();
    console.log('Testing AI provider connection...');
    console.log('Transport:', transport);
    console.log('Base URL:', cfg.baseUrl);
    console.log('ZDR enforced:', cfg.zdrEnforced);

    if (transport === 'unconfigured') {
      return NextResponse.json(
        {
          error:
            'No AI provider configured. Set AI_GATEWAY_API_KEY (preferred, with ZDR) or OPENAI_API_KEY.',
        },
        { status: 500 }
      );
    }

    const openai = getOpenAiClient();
    const requestedModel = process.env.OPENAI_MODEL || 'gpt-4o';
    console.log('Making test API call...');

    const resp = await createModelText({
      openai,
      model: requestedModel,
      messages: [
        {
          role: 'user',
          content: 'Say "Hello, API is working!" in JSON format like: {"message": "your message"}',
        },
      ],
      maxTokens: 80,
      temperature: 0,
    });

    const response = resp.text || 'No response';
    console.log('AI response:', response);

    return NextResponse.json({
      success: true,
      transport,
      baseUrl: cfg.baseUrl,
      zdrEnforced: cfg.zdrEnforced,
      requestedModel,
      resolvedModel: cfg.defaultModelHint,
      response,
      api: resp.api,
    });
  } catch (error: unknown) {
    const e = error as { message?: string; name?: string; status?: number; code?: string };
    console.error('AI test error:', {
      message: e.message,
      name: e.name,
      status: e.status,
      code: e.code,
    });

    return NextResponse.json(
      {
        error: 'Failed to connect to AI provider',
        details: e.message,
        errorType: e.name,
        status: e.status,
      },
      { status: 500 }
    );
  }
}
