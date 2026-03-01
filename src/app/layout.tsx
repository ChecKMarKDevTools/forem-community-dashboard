import type { Metadata, Viewport } from "next";
import { Marcellus, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const marcellus = Marcellus({
  weight: "400",
  variable: "--font-marcellus",
  subsets: ["latin"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "DEV Community Dashboard",
  description:
    "Monitor and support community conversations with behavioral scoring and moderation insights.",
  icons: {
    icon: { url: "/favicon.svg", type: "image/svg+xml" },
  },
};

const themeScript = `
(function(){
  try {
    var t = localStorage.getItem("theme");
    var prefersDark = matchMedia("(prefers-color-scheme:dark)").matches;
    var isDark = t === "dark" || (t !== "light" && prefersDark);
    document.documentElement.classList.toggle("dark", isDark);
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* suppressHydrationWarning: browser extensions (e.g. Colorzilla)
         inject attributes like cz-shortcut-listen on <body> before React
         hydrates, causing a harmless mismatch. */}
      <body
        suppressHydrationWarning
        className={`${marcellus.variable} ${sourceSerif.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
