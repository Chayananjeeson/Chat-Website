import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import AppHeader from "@/components/AppHeader";

export const metadata: Metadata = {
  title: "Japan Leaner Chat",
  description: "Chat app with Next.js + Firebase",
};
export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <meta name="color-scheme" content="light" />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <AppHeader />
        <main className="mx-auto max-w-4xl px-4 py-6">
          <AuthProvider>{children}</AuthProvider>
        </main>
        <footer className="border-t border-border/60 bg-white">
          <div className="mx-auto max-w-4xl px-4 py-6 text-xs text-slate-500">
            © {new Date().getFullYear()} KenChat
          </div>
        </footer>
      </body>
    </html>
  );
}
