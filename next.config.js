/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Warning: This allows production builds to successfully complete even if
    // your project has TypeScript errors.
    ignoreBuildErrors: true,
  },
    // Keep Prisma on the Node engine. Webpack's RSC/edge-light export
    // otherwise loads the Accelerate/WASM client, which rejects a normal
    // postgres DATABASE_URL with P6001 and 500s /api/auth/login.
    serverExternalPackages: ['@prisma/client', 'prisma', '.prisma/client'],
    experimental: {
      serverActions: {
        bodySizeLimit: '20mb',
      },
    },
    webpack: (config, { isServer }) => {
      if (isServer) {
        const prismaExternal = ({ request }, callback) => {
          if (
            request === '@prisma/client' ||
            request === 'prisma' ||
            (typeof request === 'string' && request.startsWith('.prisma/'))
          ) {
            return callback(null, `commonjs ${request}`)
          }
          callback()
        }
        if (Array.isArray(config.externals)) {
          config.externals.push(prismaExternal)
        } else if (config.externals) {
          config.externals = [config.externals, prismaExternal]
        } else {
          config.externals = [prismaExternal]
        }
      }
      return config
    },
}

module.exports = nextConfig


