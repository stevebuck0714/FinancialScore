import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Rate limiting storage (in-memory for now, use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Rate limit configuration
const RATE_LIMITS = {
  '/api/auth/login': { maxAttempts: 5, windowMs: 15 * 60 * 1000 }, // 5 per 15 minutes
  '/api/auth/reset-password': { maxAttempts: 3, windowMs: 60 * 60 * 1000 }, // 3 per hour
  '/api/payments': { maxAttempts: 3, windowMs: 60 * 60 * 1000 }, // 3 per hour
  '/api': { maxAttempts: 100, windowMs: 60 * 1000 }, // 100 per minute (general)
}

function checkRateLimit(identifier: string, endpoint: string): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now()
  
  // Find matching rate limit config
  let config = RATE_LIMITS['/api'] // default
  for (const [path, limit] of Object.entries(RATE_LIMITS)) {
    if (endpoint.startsWith(path) && path !== '/api') {
      config = limit
      break
    }
  }
  
  const key = `${identifier}:${endpoint}`
  const record = rateLimitStore.get(key)
  
  if (!record || now > record.resetTime) {
    // Reset or create new record
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs
    })
    return { allowed: true, remaining: config.maxAttempts - 1, resetTime: now + config.windowMs }
  }
  
  if (record.count >= config.maxAttempts) {
    return { allowed: false, remaining: 0, resetTime: record.resetTime }
  }
  
  record.count++
  rateLimitStore.set(key, record)
  
  return { allowed: true, remaining: config.maxAttempts - record.count, resetTime: record.resetTime }
}

// Clean up old rate limit records every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  
  // Get client identifier for rate limiting
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                   request.headers.get('x-real-ip') || 
                   'unknown'
  
  // Apply rate limiting to all API routes
  if (pathname.startsWith('/api')) {
    const rateLimit = checkRateLimit(clientIp, pathname)
    
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetTime - Date.now()) / 1000)
      return NextResponse.json(
        { 
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter 
        },
        { 
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': RATE_LIMITS['/api'].maxAttempts.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
          }
        }
      )
    }
    
    // Add rate limit headers to response
    const response = NextResponse.next()
    response.headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString())
    response.headers.set('X-RateLimit-Reset', new Date(rateLimit.resetTime).toISOString())
  }
  
  // Public API routes that don't require authentication
  const publicRoutes = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/reset-password',
    '/api/auth/update-password',
    '/api/check-db',
    '/api/webhooks', // Webhooks have their own authentication
  ]
  
  // Check if this is a public route
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))
  
  if (pathname.startsWith('/api') && !isPublicRoute) {
    // Get the session token
    const token = await getToken({ 
      req: request,
      secret: process.env.NEXTAUTH_SECRET 
    })
    
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      )
    }
    
    // Add user context to headers for downstream use
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', token.id as string || '')
    requestHeaders.set('x-user-email', token.email as string || '')
    requestHeaders.set('x-user-role', token.role as string || '')
    requestHeaders.set('x-company-id', token.companyId as string || '')
    requestHeaders.set('x-consultant-id', token.consultantId as string || '')
    
    // Session fingerprinting for security
    const userAgent = request.headers.get('user-agent') || ''
    const fingerprint = Buffer.from(`${clientIp}:${userAgent}`).toString('base64').substring(0, 32)
    requestHeaders.set('x-session-fingerprint', fingerprint)
    
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  }
  
  // Add security headers to all responses
  const response = NextResponse.next()
  
  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  
  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js requires unsafe-eval and unsafe-inline
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
  ].join('; ')
  response.headers.set('Content-Security-Policy', csp)
  
  // HTTPS enforcement (Strict-Transport-Security)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }
  
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

