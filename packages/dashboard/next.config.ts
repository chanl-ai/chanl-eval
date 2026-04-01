import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@chanl/eval-sdk'],
};

export default nextConfig;
