import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const LAST_ACTIVITY_COOKIE = 'fs_last_activity'
const DISABLE_IDLE_TIMEOUT = process.env.DISABLE_INACTIVITY_TIMEOUT === '1'
const DISABLE_AUTH_SIGNIN =
  process.env.NODE_ENV !== 'production' &&
  process.env.DISABLE_AUTH_SIGNIN === '1'
const DEBUG_MIDDLEWARE = process.env.DEBUG_MIDDLEWARE === '1'
const AUTH_JWT_SECRET = String(
  process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || ''
).trim()
const AUTH_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
  '__Host-next-auth.session-token',
  'authjs.session-token',
  '__Secure-authjs.session-token',
  '__Host-authjs.session-token',
]

// Rate limiting storage (in-memory for now, use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Rate limit configuration
const RATE_LIMITS = {
  '/api/auth/login': { maxAttempts: 5, windowMs: 15 * 60 * 1000 }, // 5 per 15 minutes
  '/api/auth/reset-password': { maxAttempts: 3, windowMs: 60 * 60 * 1000 }, // 3 per hour
  '/api/support-ticket/demo-upgrade': { maxAttempts: 20, windowMs: 60 * 60 * 1000 }, // public demo upgrade form
  '/api/payments': { maxAttempts: 3, windowMs: 60 * 60 * 1000 }, // 3 per hour
  // Sync status polling can be frequent (multiple open admin tabs + background refresh).
  // Keep protection in place but raise the ceiling to avoid blocking diagnostics in production.
  '/api/infor-m3/operational-sync-status': { maxAttempts: 600, windowMs: 60 * 1000 }, // 600 per minute
  '/api': { maxAttempts: 100, windowMs: 60 * 1000 }, // 100 per minute (general)
}
const DEMO_EXPIRED_ALLOWED_API_PREFIXES = ['/api/subscriptions', '/api/payments', '/api/auth/']

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

async function resolveAuthToken(request: NextRequest) {
  if (!AUTH_JWT_SECRET) return null

  let token = null
  try {
    token = await getToken({
      req: request,
      secret: AUTH_JWT_SECRET,
    })
  } catch {
    token = null
  }

  if (token) return token

  for (const cookieName of AUTH_COOKIE_NAMES) {
    try {
      token = await getToken({
        req: request,
        secret: AUTH_JWT_SECRET,
        cookieName,
      })
    } catch {
      token = null
    }
    if (token) return token
  }

  return null
}

function applyIdleActivityCookie(response: NextResponse) {
  response.cookies.set(LAST_ACTIVITY_COOKIE, String(Date.now()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(IDLE_TIMEOUT_MS / 1000),
  })
}

function clearSessionCookies(response: NextResponse) {
  for (const cookieName of AUTH_COOKIE_NAMES) {
    response.cookies.set(cookieName, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    })
  }
  response.cookies.set(LAST_ACTIVITY_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const cronSecret = String(process.env.CRON_SECRET || '').trim()
  const workerSecret = String(request.headers.get('x-infor-sync-worker-secret') || '').trim()
  const isTrustedInternalSyncWorker =
    (
      pathname.startsWith('/api/infor-m3/operational-sync') ||
      pathname.startsWith('/api/infor-m3/operational-transform-pending') ||
      pathname.startsWith('/api/infor-m3/operational-transform-raw')
    ) &&
    !!cronSecret &&
    !!workerSecret &&
    workerSecret === cronSecret
  const isTrustedQbdPostSyncWorker =
    (
      pathname === '/api/financials/reprocess-mappings' ||
      pathname === '/api/quickbooks-desktop/rebuild-ar-ap-aging'
    ) &&
    !!cronSecret &&
    !!workerSecret &&
    workerSecret === cronSecret
  // Server-to-server admin/operational endpoints (rebuild-cash-snapshots,
  // rebuild-daily-bs, etc.) authenticate via the same CRON_SECRET passed as
  // the `x-cron-secret` header. The route handler still enforces the secret
  // independently inside the request body — this header bypass only lets the
  // call past the user-session middleware.
  const adminCronHeader = String(request.headers.get('x-cron-secret') || '').trim()
  const isTrustedAdminCronCall =
    pathname.startsWith('/api/admin/') &&
    !!cronSecret &&
    !!adminCronHeader &&
    adminCronHeader === cronSecret
  const isDevBambooHrPayloadProbe =
    process.env.NODE_ENV === 'development' &&
    (pathname === '/api/operational-system-integrations/bamboohr/payload-sample' ||
      pathname === '/api/operational-system-integrations/bamboohr/sync-workforce-reports') &&
    request.headers.get('x-dev-bamboohr-probe') === '1'
  
  // Get client identifier for rate limiting
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                   request.headers.get('x-real-ip') || 
                   'unknown'
  
  // Apply API rate limiting in production only.
  // Dev/staging testing flows can generate many auth/session calls quickly.
  const shouldApplyRateLimit = process.env.NODE_ENV === 'production'
  if (pathname.startsWith('/api') && shouldApplyRateLimit) {
    const rateLimit = checkRateLimit(clientIp, pathname)
    
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetTime - Date.now()) / 1000)
      if (DEBUG_MIDDLEWARE) {
        console.log('⚠️ Rate limit exceeded for:', pathname)
      }
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
            'X-RateLimit-Limit': String((Object.entries(RATE_LIMITS).find(([path]) => pathname.startsWith(path) && path !== '/api')?.[1] || RATE_LIMITS['/api']).maxAttempts),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
          }
        }
      )
    }
    
    // Only log rate limit for non-session endpoints (session checks are very frequent)
    if (!pathname.includes('/api/auth/session')) {
      if (DEBUG_MIDDLEWARE) {
        console.log('✅ Rate limit passed for:', pathname, 'Remaining:', rateLimit.remaining)
      }
    }
  }
  
  // Public API routes that don't require authentication
  const publicRoutes = [
    '/api/auth/', // All NextAuth routes including callbacks, sessions, etc.
    '/api/check-db',
    '/api/webhooks', // Webhooks have their own authentication
    '/api/cron', // Vercel Cron endpoints authenticate via headers/secret
  ]
  
  // Check if this is a public route
  const isPublicRoute =
    publicRoutes.some((route) => pathname.startsWith(route)) ||
    pathname === '/api/support-ticket/demo-upgrade'
  const token = DISABLE_AUTH_SIGNIN ? null : await resolveAuthToken(request)
  const tokenDemoCompany = Boolean(token && (token as any).demoCompany)
  const tokenDemoExpiredFlag = Boolean(token && (token as any).demoExpired)
  const tokenDemoExpiresAtRaw = token ? String((token as any).demoExpiresAt || '') : ''
  const tokenDemoExpiresAtMs = tokenDemoExpiresAtRaw ? Date.parse(tokenDemoExpiresAtRaw) : NaN
  const tokenDemoExpiredByDate =
    tokenDemoCompany && Number.isFinite(tokenDemoExpiresAtMs) && Date.now() > tokenDemoExpiresAtMs
  const tokenDemoExpired = tokenDemoExpiredFlag || tokenDemoExpiredByDate

  const lastActivityRaw = request.cookies.get(LAST_ACTIVITY_COOKIE)?.value
  const lastActivityMs = lastActivityRaw ? Number.parseInt(lastActivityRaw, 10) : NaN
  const hasValidLastActivity = Number.isFinite(lastActivityMs)
  const isIdleExpired =
    !DISABLE_IDLE_TIMEOUT &&
    Boolean(token) &&
    hasValidLastActivity &&
    Date.now() - lastActivityMs > IDLE_TIMEOUT_MS

  if (isIdleExpired) {
    if (pathname.startsWith('/api')) {
      const response = NextResponse.json(
        { error: 'Unauthorized', message: 'Session expired due to inactivity. Please log in again.' },
        { status: 401 }
      )
      clearSessionCookies(response)
      return response
    }

    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('sessionExpired', '1')
    const response = NextResponse.redirect(url)
    clearSessionCookies(response)
    return response
  }
  
  // Debug logging for MFA endpoints
  if (DEBUG_MIDDLEWARE && pathname.includes('/mfa/')) {
    console.log('🔍 MFA endpoint detected:', {
      pathname,
      isPublicRoute,
      willRequireAuth: pathname.startsWith('/api') && !isPublicRoute
    })
  }
  
  if (
    pathname.startsWith('/api') &&
    !isPublicRoute &&
    !isTrustedInternalSyncWorker &&
    !isTrustedQbdPostSyncWorker &&
    !isTrustedAdminCronCall &&
    !isDevBambooHrPayloadProbe &&
    !DISABLE_AUTH_SIGNIN
  ) {
    if (tokenDemoExpired) {
      const isDemoExpiredAllowedApi = DEMO_EXPIRED_ALLOWED_API_PREFIXES.some((prefix) =>
        pathname.startsWith(prefix)
      )
      if (!isDemoExpiredAllowedApi) {
      return NextResponse.json(
        {
          error: 'Demo expired',
          message: 'Your 7-day demo has expired. Please upgrade to continue.',
        },
        { status: 403 }
      )
      }
    }

    if (DEBUG_MIDDLEWARE) {
      console.log('🔐 Middleware auth check:', {
        path: pathname,
        hasToken: !!token,
        hasSecret: !!AUTH_JWT_SECRET,
        cookies: request.cookies.getAll().map(c => c.name),
        tokenEmail: token?.email || 'none'
      })
    }
    
    if (!token) {
      if (DEBUG_MIDDLEWARE) {
        console.log('❌ No token found, returning 401')
      }
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      )
    }
    
    if (DEBUG_MIDDLEWARE) {
      console.log('✅ Token found, user:', token.email)
    }
    
    // Add user context to headers for downstream use
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', token.id as string || '')
    requestHeaders.set('x-user-email', token.email as string || '')
    const normalizedRole = String(token.role || '').trim().toUpperCase()
    requestHeaders.set('x-user-role', normalizedRole)
    requestHeaders.set('x-company-id', token.companyId as string || '')
    requestHeaders.set('x-consultant-id', token.consultantId as string || '')
    const activeCompanyCookie = request.cookies.get('fs_active_company')?.value || ''
    requestHeaders.set('x-active-company-id', activeCompanyCookie)
    
    // Session fingerprinting for security
    const userAgent = request.headers.get('user-agent') || ''
    const fingerprint = Buffer.from(`${clientIp}:${userAgent}`).toString('base64').substring(0, 32)
    requestHeaders.set('x-session-fingerprint', fingerprint)
    
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
    if (!DISABLE_IDLE_TIMEOUT) {
      applyIdleActivityCookie(response)
    }
    return response
  }
  
  // Add security headers to all responses
  if (
    tokenDemoExpired &&
    !pathname.startsWith('/api') &&
    pathname !== '/' &&
    pathname !== '/register-business'
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('demoExpired', '1')
    return NextResponse.redirect(url)
  }

  const response = NextResponse.next()
  if (token && !DISABLE_IDLE_TIMEOUT) {
    applyIdleActivityCookie(response)
  }
  
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
    "frame-src 'self' https://docs.google.com https://view.officeapps.live.com",
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

