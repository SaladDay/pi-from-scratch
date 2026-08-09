import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const themeScript = `
  (() => {
    try {
      const saved = localStorage.getItem("pi-from-scratch-theme");
      const theme = saved === "light" || saved === "dark"
        ? saved
        : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch {}
  })();
`;

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "PI from Scratch · 从零手写 Coding Agent";
  const description = "沿着数据流读懂五个 TypeScript 文件，从零写出 Agent Loop，并用断点回放真实 trace。";

  return {
    metadataBase: new URL(origin),
    title,
    description,
    keywords: ["AI agent", "coding agent", "agent loop", "tool calling", "TypeScript", "pi"],
    alternates: { canonical: origin },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1731, height: 909, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
