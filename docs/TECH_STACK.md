Corelytics Financial Score - Tech Stack Summary

Overview
- Framework: Next.js 14 (App Router)
- Language: TypeScript, React 18
- Runtime: Node.js

Frontend
- UI: React with Next.js server/client components
- Charts: Recharts
- Icons: lucide-react
- Notifications: react-hot-toast

Backend / API
- API: Next.js Route Handlers (app/api)
- Auth: NextAuth.js (beta)
- Realtime: socket.io (server and client)

Data Layer
- ORM: Prisma
- Databases: PostgreSQL (pg) and SQLite (dev tooling)
- Migrations/Seeds: Prisma CLI + tsx scripts

Integrations
- QuickBooks: intuit-oauth
- Xero: xero-node
- Email: Resend
- AI: OpenAI SDK

Security / MFA
- Password hashing: bcryptjs
- MFA/OTP: speakeasy + qrcode

Tooling
- Linting: ESLint with eslint-config-next
- Typechecking: TypeScript
- Scripts: tsx runner for scripts and seeds

Build/Deployment
- Build: next build + Prisma generate
- Runtime server: custom Node server (server.js) and Next.js server on Vercel
