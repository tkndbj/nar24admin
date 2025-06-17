import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Admin Portal - Secure Dashboard",
  description: "Secure admin panel for Flutter app management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster
          position="top-right"
          reverseOrder={false}
          gutter={8}
          containerClassName=""
          containerStyle={{}}
          toastOptions={{
            // Default options for all toasts
            duration: 4000,
            style: {
              background: 'rgba(30, 41, 59, 0.95)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(12px)',
              borderRadius: '12px',
              padding: '16px',
              fontSize: '14px',
              fontWeight: '500',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            },
            
            // Success toasts
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#10B981', // Green
                secondary: '#fff',
              },
              style: {
                border: '1px solid rgba(16, 185, 129, 0.3)',
              },
            },
            
            // Error toasts
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#EF4444', // Red
                secondary: '#fff',
              },
              style: {
                border: '1px solid rgba(239, 68, 68, 0.3)',
              },
            },
            
            // Loading toasts
            loading: {
              duration: Infinity,
              iconTheme: {
                primary: '#3B82F6', // Blue
                secondary: '#fff',
              },
              style: {
                border: '1px solid rgba(59, 130, 246, 0.3)',
              },
            },
            
            // Custom toast styles can be added here
            custom: {
              duration: 4000,
            },
          }}
        />
      </body>
    </html>
  );
}