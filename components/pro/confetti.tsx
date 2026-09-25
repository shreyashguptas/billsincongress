'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A three-second burst of confetti in the six topic colours, for the one
 * moment a reader becomes Pro. One canvas, one requestAnimationFrame loop, no
 * dependency. It never takes a click (pointer-events: none), removes itself
 * when done, and draws nothing at all under prefers-reduced-motion — the
 * welcome dialog's static spectrum burst is the celebration then.
 *
 * Colours are read from the theme's `--topic-*` variables at run time, so the
 * confetti matches Day or Night and no colour is written here.
 */

const DURATION_MS = 3000;
const FADE_MS = 700;
const COUNT = 140;

type Shape = 'rect' | 'dot' | 'seat';

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vrot: number;
  tilt: number;
  vtilt: number;
  color: string;
  shape: Shape;
}

function topicColours(): string[] {
  const style = getComputedStyle(document.documentElement);
  const out = [1, 2, 3, 4, 5, 6]
    .map((n) => style.getPropertyValue(`--topic-${n}`).trim())
    .filter(Boolean);
  // No palette to read (a stripped stylesheet): draw in the text colour.
  return out.length ? out : [style.color || 'currentColor'];
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (reducedMotion()) {
      setDone(true);
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      setDone(true);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = window.innerWidth;
    let h = window.innerHeight;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const colours = topicColours();
    const shapes: Shape[] = ['rect', 'rect', 'dot', 'seat'];
    // Two cannons at the top corners, aimed in and up, so the pieces cross
    // over the dialog and fall around it.
    const pieces: Piece[] = Array.from({ length: COUNT }, (_, i) => {
      const left = i % 2 === 0;
      const angle = (left ? -60 : -120) + (Math.random() - 0.5) * 40;
      const speed = 9 + Math.random() * 9;
      const rad = (angle * Math.PI) / 180;
      return {
        x: left ? -10 : w + 10,
        y: h * (0.35 + Math.random() * 0.2),
        vx: Math.cos(rad) * speed * (w < 600 ? 0.7 : 1),
        vy: Math.sin(rad) * speed,
        size: 6 + Math.random() * 6,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.3,
        tilt: Math.random() * Math.PI * 2,
        vtilt: 0.08 + Math.random() * 0.12,
        color: colours[i % colours.length],
        shape: shapes[i % shapes.length],
      };
    });

    let raf = 0;
    const start = performance.now();
    let last = start;
    const frame = (now: number) => {
      const t = now - start;
      // Frame-rate independent: steps are in 60fps units.
      const k = Math.min(3, (now - last) / (1000 / 60));
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = t > DURATION_MS - FADE_MS ? Math.max(0, (DURATION_MS - t) / FADE_MS) : 1;
      for (const p of pieces) {
        p.vy += 0.32 * k; // gravity
        p.vx *= Math.pow(0.985, k); // air
        p.vy *= Math.pow(0.985, k);
        p.x += p.vx * k;
        p.y += p.vy * k;
        p.rot += p.vrot * k;
        p.tilt += p.vtilt * k;
        if (p.y > h + 20) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        // A flutter: the piece turns edge-on and back.
        ctx.scale(1, Math.cos(p.tilt));
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else if (p.shape === 'dot') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // A seat from the chamber mark: a half-round, flat side down.
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.2, Math.PI, 0);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      if (t < DURATION_MS) raf = requestAnimationFrame(frame);
      else setDone(true);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  if (done) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] h-full w-full"
    />
  );
}
