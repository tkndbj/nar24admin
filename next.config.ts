import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@google-cloud/monitoring'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/v0/b/**',
      },
    ],
  },
  webpack: (config: any, { isServer }: any) => {
    if (isServer) {
      config.externals.push({
        '@google-cloud/monitoring': 'commonjs @google-cloud/monitoring'
      });
    }
    return config;
  }
};

export default nextConfig;