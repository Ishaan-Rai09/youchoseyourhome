import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import DotGrid from "@/components/dot-grid";
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
  title: "Glowup — give your deploy URL a glow up",
  description:
    "Turn ugly deploy URLs like beamdrop-6ym9.onrender.com into clean branded links that open your real site. No domain, no DNS, no code.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DotGrid />
        {children}
      </body>
    </html>
  );
}
