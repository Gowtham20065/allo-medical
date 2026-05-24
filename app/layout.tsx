import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Allo Reservations",
  description: "Race-condition-safe inventory reservations for checkout"
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
