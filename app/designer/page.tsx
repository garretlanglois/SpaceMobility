"use client";

import { useState } from "react";
import SceneDesigner from "@/components/SceneDesigner";
import SplashScreen from "@/components/SplashScreen";

export default function DesignerPage() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <main style={{ height: "100vh", width: "100vw", overflow: "hidden" }}>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      <SceneDesigner />
    </main>
  );
}

