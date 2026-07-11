/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Prettier quote-style warnings should not block production builds.
    // Run `npm run lint` separately for formatting checks.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
