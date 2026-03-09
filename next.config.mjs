/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cafef.vn' },
      { protocol: 'https', hostname: '*.tcbs.com.vn' },
    ],
  },
}

export default nextConfig
