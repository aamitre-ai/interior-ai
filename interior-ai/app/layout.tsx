import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interior AI — Visualiza tu mueble en tu habitación",
  description: "Sube una foto de tu habitación y visualiza cualquier mueble con IA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-[#0f0f0f] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
