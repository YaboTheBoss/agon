import type { Metadata, Viewport } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import BottomNav from "@/components/BottomNav";
import PairToast from "@/components/PairToast";
import ProfileGate from "@/components/ProfileGate";
import { AuthProvider } from "@/lib/auth";
import { SpacetimeProvider } from "@/lib/store";
import "./globals.css";
import { Suspense } from "react";
import NavigationMemory from "@/components/NavigationMemory";

const display = Lilita_One({ subsets: ["latin"], weight: "400", variable: "--font-display" });
const body = Nunito({ subsets: ["latin"], weight: ["400", "600", "700", "800", "900"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "yaapi",
  description: "Pick a side. Get paired. Argue nicely.",
};

export const viewport: Viewport = {
  themeColor: "#F6F3FF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="bg-[#F6F3FF] font-[family-name:var(--font-body)] text-[#1E1B2E] antialiased">
        <AuthProvider>
          <SpacetimeProvider>
            <div className="app-shell min-h-[100dvh] bg-[#F6F3FF]">
              {children}
              <Suspense fallback={null}><NavigationMemory /></Suspense>
              <BottomNav />
              <PairToast />
              <ProfileGate />
            </div>
          </SpacetimeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
