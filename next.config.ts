import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com", pathname: "/v0/b/**" },
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/op4zrf9o/image/upload/**" },
      { protocol: "https", hostname: "vehicle.s3.us-east-005.backblazeb2.com", pathname: "/vehicles/**" },
    ],
  },
};

export default nextConfig;
