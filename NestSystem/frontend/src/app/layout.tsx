import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nest — Thapar Hostel Room Booking",
  description: "Book your hostel room and cluster with your friends.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
