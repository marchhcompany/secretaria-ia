"use client";

import { useEffect, useRef } from "react";

/** Rede de pontos laranja em movimento lento, como nas artes da March. */
export function NetworkBackground({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    type P = { x: number; y: number; vx: number; vy: number; r: number };
    let points: P[] = [];

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(90, (w * h) / 14000));
      points = Array.from({ length: count }, () => {
        // Mais pontos nas bordas, deixando o centro livre para o texto.
        const edge = Math.random() < 0.75;
        const x = edge ? (Math.random() < 0.5 ? Math.random() * w * 0.28 : w - Math.random() * w * 0.32) : Math.random() * w;
        return {
          x,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.18,
          r: Math.random() * 2.2 + 0.8,
        };
      });
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h);
      const max = 130;
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        for (let j = i + 1; j < points.length; j++) {
          const b = points[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < max) {
            ctx!.strokeStyle = `rgba(253, 84, 1, ${0.28 * (1 - d / max)})`;
            ctx!.lineWidth = 0.7;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }
      for (const p of points) {
        ctx!.fillStyle = "rgba(253, 84, 1, 0.85)";
        ctx!.shadowColor = "rgba(253, 84, 1, 0.9)";
        ctx!.shadowBlur = 8;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.shadowBlur = 0;
      }
    }

    function tick() {
      for (const p of points) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      draw();
      raf = requestAnimationFrame(tick);
    }

    resize();
    if (reduce) draw();
    else raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw();
    });
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
