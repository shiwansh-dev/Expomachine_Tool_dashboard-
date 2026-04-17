import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
