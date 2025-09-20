import { ImageResponse } from "next/og";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

export default async function TwitterImage() {
  const { width, height } = size;
  return new ImageResponse(
    (
      <div
        style={{
          width: `${width}px`,
          height: `${height}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "56px",
          background:
            "linear-gradient(135deg, #FDE68A 0%, #FCA5A5 40%, #93C5FD 80%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            backgroundColor: "rgba(255,255,255,0.94)",
            borderRadius: 24,
            padding: "32px 36px",
            boxShadow: "0 10px 30px rgba(16,24,40,0.12)",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              backgroundColor: "#3B82F6",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontSize: 28,
              fontWeight: 800,
              fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system",
            }}
          >
            IA
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 48,
                lineHeight: 1.1,
                color: "#0F172A",
                fontWeight: 800,
                fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system",
              }}
            >
              Joslyn AI — Clarity for IEPs
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 26,
                color: "#334155",
                fontWeight: 500,
                fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system",
              }}
            >
              Ask with citations • timelines • parent‑friendly letters
            </div>
          </div>
        </div>
      </div>
    ),
    { width, height }
  );
}

