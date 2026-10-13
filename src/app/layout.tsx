import type { Metadata } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const sans = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans" });
const display = Source_Serif_4({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: { default: "Grenada Bureau of Standards", template: "%s · GDBS" },
  description: "Client services for laboratory testing, sample receipt, and issued reports.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable}`}>
        <a className="skip" href="#content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
