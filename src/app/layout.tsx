import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "E-Meet — Private 1:1 Video",
  description:
    "Simple, private 1-to-1 video conversations without the clutter. End-to-end encrypted, peer-to-peer, ephemeral.",
  themeColor: "#0a0a0b",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col text-[var(--text-primary)]">
        <div className="flex min-h-dvh flex-col">{children}</div>
      </body>
    </html>
  );
}
