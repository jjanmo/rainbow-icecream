const ASPECT = 34 / 38;

export function LogoMark({ size = 34, className }: { size?: number; className?: string }) {
  const height = size / ASPECT;

  return (
    <div
      className={className}
      style={{ position: "relative", width: size, height, flexShrink: 0 }}
    >
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "70.6%",
          height: "52.6%",
          background: "oklch(76% 0.08 55)",
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(255,255,255,0.4) 0 2px, transparent 2px 5px)",
          clipPath: "polygon(50% 100%, 8% 0%, 92% 0%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "2.6%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "61.8%",
          height: "55.3%",
          borderRadius: "50%",
          background: "oklch(62% 0.14 340)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "21%",
          left: "17.6%",
          width: "50%",
          height: "44.7%",
          borderRadius: "50%",
          background: "oklch(66% 0.12 150)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "34.2%",
          left: "52.9%",
          width: "44.1%",
          height: "39.5%",
          borderRadius: "50%",
          background: "oklch(70% 0.12 75)",
        }}
      />
    </div>
  );
}
