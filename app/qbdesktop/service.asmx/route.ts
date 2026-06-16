import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const QBWC_NAMESPACE = 'http://developer.intuit.com/';

type QbDesktopMetadata = {
  quickbooksDesktopCredentials?: {
    webConnectorUsername?: unknown;
    webConnectorPasswordEncrypted?: unknown;
  };
};

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlDecode(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function getXmlText(xml: string, tagName: string): string {
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${tagName}>`, 'i');
  const match = xml.match(pattern);
  return match ? xmlDecode(match[1].trim()) : '';
}

function getSoapMethod(xml: string): string {
  const methods = [
    'serverVersion',
    'clientVersion',
    'authenticate',
    'sendRequestXML',
    'receiveResponseXML',
    'getLastError',
    'closeConnection',
  ];
  return methods.find((method) => new RegExp(`<(?:[\\w.-]+:)?${method}\\b`, 'i').test(xml)) || '';
}

function soapResponse(method: string, resultTag: string, resultXml: string): NextResponse {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <${method}Response xmlns="${QBWC_NAMESPACE}">
      <${resultTag}>${resultXml}</${resultTag}>
    </${method}Response>
  </soap:Body>
</soap:Envelope>`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function soapString(method: string, value: string): NextResponse {
  return soapResponse(method, `${method}Result`, xmlEscape(value));
}

function soapInt(method: string, value: number): NextResponse {
  return soapResponse(method, `${method}Result`, String(value));
}

function soapFault(message: string): NextResponse {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Server</faultcode>
      <faultstring>${xmlEscape(message)}</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

  return new NextResponse(body, {
    status: 500,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function getMetadata(value: unknown): QbDesktopMetadata {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as QbDesktopMetadata) : {};
}

async function authenticateWebConnector(username: string, password: string): Promise<string | null> {
  if (!username || !password) return null;

  const connections = await prisma.accountingConnection.findMany({
    where: { platform: 'QUICKBOOKS' },
    select: {
      companyId: true,
      connectionMetadata: true,
    },
  });

  for (const connection of connections) {
    const metadata = getMetadata(connection.connectionMetadata);
    const credentials = metadata.quickbooksDesktopCredentials;
    const storedUsername =
      typeof credentials?.webConnectorUsername === 'string'
        ? credentials.webConnectorUsername.trim()
        : '';
    const encryptedPassword =
      typeof credentials?.webConnectorPasswordEncrypted === 'string'
        ? credentials.webConnectorPasswordEncrypted
        : '';

    if (storedUsername !== username || !encryptedPassword) continue;

    try {
      const storedPassword = decryptOAuthToken(encryptedPassword);
      if (storedPassword === password) return connection.companyId;
    } catch (error) {
      console.error('Failed to decrypt QuickBooks Desktop Web Connector password', {
        companyId: connection.companyId,
        error,
      });
      return null;
    }
  }

  return null;
}

function authenticateResponse(ticket: string, companyFilePath = ''): NextResponse {
  return soapResponse(
    'authenticate',
    'authenticateResult',
    `<string>${xmlEscape(ticket)}</string><string>${xmlEscape(companyFilePath)}</string>`,
  );
}

export async function GET() {
  return new NextResponse('Corelytics QuickBooks Desktop Web Connector endpoint', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(request: NextRequest) {
  const xml = await request.text();
  const method = getSoapMethod(xml);

  try {
    switch (method) {
      case 'serverVersion':
        return soapString('serverVersion', 'Corelytics QBWC Service 1.0');

      case 'clientVersion':
        return soapString('clientVersion', '');

      case 'authenticate': {
        const username = getXmlText(xml, 'strUserName');
        const password = getXmlText(xml, 'strPassword');
        const companyId = await authenticateWebConnector(username, password);

        if (!companyId) {
          return authenticateResponse('', 'nvu');
        }

        return authenticateResponse(`corelytics:${companyId}:${randomUUID()}`);
      }

      case 'sendRequestXML':
        // This confirms the connection but intentionally sends no QBXML work yet.
        return soapString('sendRequestXML', '');

      case 'receiveResponseXML':
        return soapInt('receiveResponseXML', 100);

      case 'getLastError':
        return soapString('getLastError', '');

      case 'closeConnection':
        return soapString('closeConnection', 'OK');

      default:
        return soapFault('Unsupported QuickBooks Web Connector SOAP method.');
    }
  } catch (error) {
    console.error('QuickBooks Desktop Web Connector SOAP error', { method, error });
    return soapFault(error instanceof Error ? error.message : 'Unknown Web Connector error.');
  }
}
