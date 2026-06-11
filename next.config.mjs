/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "replicate.delivery" },
      { protocol: "https", hostname: "pbxt.replicate.delivery" },
    ],
  },
  // Replicate responses can be large; increase body size limit
  experimental: {
    serverComponentsExternalPackages: ["sharp"],
  },
};

export default nextConfig;
