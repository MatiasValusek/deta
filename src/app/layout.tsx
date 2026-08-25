import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "deta - Prueba DXF",
  description: "Prueba tecnica de importacion y visualizacion DXF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
