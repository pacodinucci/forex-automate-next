import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    position: "bottom-right",
  },
  outputFileTracingIncludes: {
    "/*": ["./generated/prisma/**/*"],
  },
};

export default nextConfig;
