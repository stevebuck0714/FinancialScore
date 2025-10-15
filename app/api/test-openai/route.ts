import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function GET(request: NextRequest) {
  try {
    console.log('Testing OpenAI connection...');
    console.log('API Key present:', !!process.env.OPENAI_API_KEY);
    console.log('API Key prefix:', process.env.OPENAI_API_KEY?.substring(0, 10));

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not set in environment' },
        { status: 500 }
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    console.log('Making test API call to OpenAI...');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: 'Say "Hello, API is working!" in JSON format like: {"message": "your message"}',
        },
      ],
      max_tokens: 50,
    });

    const response = completion.choices[0]?.message?.content || 'No response';
    console.log('OpenAI response:', response);

    return NextResponse.json({ 
      success: true,
      apiKeyConfigured: true,
      response: response,
      model: completion.model
    });
  } catch (error: any) {
    console.error('OpenAI test error:', {
      message: error.message,
      name: error.name,
      status: error.status,
      code: error.code
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to connect to OpenAI',
        details: error.message,
        errorType: error.name,
        status: error.status
      },
      { status: 500 }
    );
  }
}


