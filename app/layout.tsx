import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;

  return {
    title: "快传｜告诉朋友一个编号",
    description: "临时分享文件、图片和文字，上传后只需告诉朋友一个简单编号。",
    openGraph: {
      title: "快传｜告诉朋友一个编号",
      description: "文件、图片、文字，临时分享。",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: "快传：放上来，告诉他编号。" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "快传｜告诉朋友一个编号",
      description: "文件、图片、文字，临时分享。",
      images: [image],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hans">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
