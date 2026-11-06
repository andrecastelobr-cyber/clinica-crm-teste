import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title:"Clínica • Gestão e cuidado", description:"Agenda e prontuário para clínicas médicas e odontológicas" };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="pt-BR"><body>{children}</body></html>}
