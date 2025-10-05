"use client";

import { useEffect, useState } from "react";
import * as satellite from "satellite.js";

interface ISSPosition {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
}

interface TLEData {
  name: string;
  line1: string;
  line2: string;
  date: string;
}

export default function ISSPositionDisplay() {
  const [issPosition, setIssPosition] = useState<ISSPosition | null>(null);
  const [tleName, setTleName] = useState<string>("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const fetchISSPosition = async () => {
    try {
      const response = await fetch("https://tle.ivanstanojevic.me/api/tle/25544");
      if (!response.ok) {
        throw new Error("Failed to fetch TLE data");
      }
      
      const data: TLEData = await response.json();
      setTleName(data.name);
      
      // Parse TLE data
      const satrec = satellite.twoline2satrec(data.line1, data.line2);
      
      // Get current date
      const now = new Date();
      
      // Propagate satellite position
      const positionAndVelocity = satellite.propagate(satrec, now);
      
      if (positionAndVelocity && positionAndVelocity.position && typeof positionAndVelocity.position !== "boolean") {
        const positionEci = positionAndVelocity.position;
        
        // Convert to geodetic coordinates
        const gmst = satellite.gstime(now);
        const positionGd = satellite.eciToGeodetic(positionEci, gmst);
        
        // Convert to degrees and km
        const latitude = satellite.degreesLat(positionGd.latitude);
        const longitude = satellite.degreesLong(positionGd.longitude);
        const altitude = positionGd.height; // in km
        
        // Calculate velocity if available
        let velocity = 0;
        if (positionAndVelocity.velocity && typeof positionAndVelocity.velocity !== "boolean") {
          const vel = positionAndVelocity.velocity;
          velocity = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
        }
        
        setIssPosition({
          latitude,
          longitude,
          altitude,
          velocity
        });
        setLastUpdate(now);
        setError(null);
      } else {
        throw new Error("Invalid position data");
      }
    } catch (err) {
      console.error("Error fetching ISS position:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  useEffect(() => {
    // Fetch immediately
    fetchISSPosition();
    
    // Update every 5 seconds
    const interval = setInterval(fetchISSPosition, 5000);
    
    return () => clearInterval(interval);
  }, []);

  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        aria-label="Expand ISS position"
        style={{
          position: "absolute",
          bottom: 60,
          right: 12,
          background: "#000",
          border: "1px solid #4ade80",
          color: "#4ade80",
          padding: "6px 12px",
          fontSize: 12,
          cursor: "pointer",
          boxShadow: "0 0 10px rgba(74, 222, 128, 0.3)"
        }}
      >
        🛰️ ISS
      </button>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        bottom: 60,
        right: 12,
        background: "#000",
        border: "2px solid #4ade80",
        color: "#fff",
        padding: "12px 16px",
        minWidth: 280,
        maxWidth: 320,
        boxShadow: "0 0 20px rgba(74, 222, 128, 0.2)"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🛰️</span>
          <div style={{ fontSize: 14, fontWeight: "bold", color: "#4ade80" }}>
            {tleName || "ISS Position"}
          </div>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          aria-label="Collapse ISS position"
          style={{
            width: 24,
            height: 24,
            padding: 0,
            background: "transparent",
            border: "1px solid #4ade80",
            color: "#4ade80",
            cursor: "pointer",
            fontSize: 16
          }}
        >
          –
        </button>
      </div>

      {error ? (
        <div style={{ color: "#ef4444", fontSize: 12, padding: "8px 0" }}>
          Error: {error}
        </div>
      ) : issPosition ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "4px 12px" }}>
            <div style={{ color: "#888" }}>Latitude:</div>
            <div style={{ fontFamily: "monospace", color: "#4ade80" }}>
              {issPosition.latitude.toFixed(4)}°
            </div>
            
            <div style={{ color: "#888" }}>Longitude:</div>
            <div style={{ fontFamily: "monospace", color: "#4ade80" }}>
              {issPosition.longitude.toFixed(4)}°
            </div>
            
            <div style={{ color: "#888" }}>Altitude:</div>
            <div style={{ fontFamily: "monospace", color: "#4ade80" }}>
              {issPosition.altitude.toFixed(2)} km
            </div>
            
            <div style={{ color: "#888" }}>Velocity:</div>
            <div style={{ fontFamily: "monospace", color: "#4ade80" }}>
              {issPosition.velocity.toFixed(2)} km/s
            </div>
          </div>

          {lastUpdate && (
            <div style={{ fontSize: 10, color: "#666", marginTop: 4, borderTop: "1px solid #333", paddingTop: 6 }}>
              Updated: {lastUpdate.toLocaleTimeString()}
            </div>
          )}

          <div style={{ 
            fontSize: 9, 
            color: "#555", 
            marginTop: 2,
            fontStyle: "italic" 
          }}>
            Live data from TLE • Updates every 5s
          </div>
        </div>
      ) : (
        <div style={{ color: "#888", fontSize: 12, padding: "8px 0" }}>
          Loading position data...
        </div>
      )}
    </div>
  );
}
