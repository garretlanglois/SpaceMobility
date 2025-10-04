export const metadata = {
  title: "3D Grid - Space Mobility",
  description: "Interactive 3D grid of points with line drawing"
};

import "@/styles/globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}

