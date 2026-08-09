import type { Metadata } from "next";
import "./globals.css";

const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
const origin = deploymentHost
  ? deploymentHost.startsWith("http") ? deploymentHost : `https://${deploymentHost}`
  : "http://localhost:3000";
const title = "PI from Scratch · 创造属于你的pi-agent";
const description = "沿着数据流读懂五个 TypeScript 文件，从零写出 Agent Loop，并用断点回放真实 trace。";

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title,
  description,
  keywords: ["AI agent", "coding agent", "agent loop", "tool calling", "TypeScript", "pi"],
  alternates: { canonical: origin },
  openGraph: {
    title,
    description,
    type: "website",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: title }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
