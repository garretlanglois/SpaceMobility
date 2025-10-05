"use client";

import { useEffect, useState } from "react";

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Simulate loading progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setFadeOut(true);
            setTimeout(onComplete, 500);
          }, 300);
          return 100;
        }
        return prev + 2;
      });
    }, 30);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        opacity: fadeOut ? 0 : 1,
        transition: "opacity 0.5s ease-out",
        fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace",
      }}
    >
      {/* Animated grid background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            linear-gradient(to right, #111 1px, transparent 1px),
            linear-gradient(to bottom, #111 1px, transparent 1px)
          `,
          backgroundSize: "50px 50px",
          opacity: 0.3,
          animation: "gridMove 20s linear infinite",
        }}
      />

      {/* Animated stars */}
      {[...Array(50)].map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: Math.random() * 3 + 1 + "px",
            height: Math.random() * 3 + 1 + "px",
            background: "#fff",
            borderRadius: "50%",
            left: Math.random() * 100 + "%",
            top: Math.random() * 100 + "%",
            opacity: Math.random() * 0.7 + 0.3,
            animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 2}s`,
          }}
        />
      ))}

      {/* Main content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          animation: "fadeInUp 1s ease-out",
        }}
      >
        {/* Logo/Title */}
        <div
          style={{
            fontSize: "48px",
            fontWeight: "bold",
            color: "#fff",
            marginBottom: "16px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            textShadow: "0 0 20px rgba(255, 255, 255, 0.5)",
          }}
        >
          SpaceMobility
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "14px",
            color: "#999",
            marginBottom: "48px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          Space Station Route Designer
        </div>

        {/* Loading bar container */}
        <div
          style={{
            width: "400px",
            height: "2px",
            background: "#222",
            borderRadius: "1px",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Loading bar fill */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, #fff, #888)",
              transition: "width 0.3s ease-out",
              boxShadow: "0 0 10px rgba(255, 255, 255, 0.5)",
            }}
          />
        </div>

        {/* Progress text */}
        <div
          style={{
            marginTop: "16px",
            fontSize: "12px",
            color: "#666",
            letterSpacing: "0.1em",
          }}
        >
          {progress < 100 ? "INITIALIZING SYSTEMS..." : "READY"}
        </div>

        {/* System status */}
        <div
          style={{
            marginTop: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            fontSize: "10px",
            color: "#444",
            letterSpacing: "0.05em",
          }}
        >
          <div style={{ opacity: progress > 20 ? 1 : 0.3, transition: "opacity 0.3s" }}>
            ✓ 3D RENDERING ENGINE
          </div>
          <div style={{ opacity: progress > 40 ? 1 : 0.3, transition: "opacity 0.3s" }}>
            ✓ GRID SYSTEM
          </div>
          <div style={{ opacity: progress > 60 ? 1 : 0.3, transition: "opacity 0.3s" }}>
            ✓ ROUTE PLANNER
          </div>
          <div style={{ opacity: progress > 80 ? 1 : 0.3, transition: "opacity 0.3s" }}>
            ✓ MODEL IMPORTER
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes gridMove {
          from {
            transform: translate(0, 0);
          }
          to {
            transform: translate(50px, 50px);
          }
        }

        @keyframes twinkle {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

