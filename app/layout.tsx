export const metadata = {
  title: "SpaceMobility – Space Station Route Designer",
  description: "Interactive 3D designer for astronaut movement and station layout"
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

