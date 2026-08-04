import type { Metadata } from "next";
import AppShell from "@/app/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Factory Genie Dashboard",
  description: "Simple live-status dashboard backed by MySQL."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
