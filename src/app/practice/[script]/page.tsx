"use client";

import Link from "next/link";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from "react";
import { useParams, useRouter } from "next/navigation";

/* ---------- Types & Data ---------- */

type Script = "hiragana" | "katakana";

// เส้น = ลิสต์ของจุด (หนึ่งเส้น = หนึ่ง path)
export type Pt = { x: number; y: number };
export type Stroke = Pt[];

const H_ROWS = [
  { key: "a",  row: ["あ","い","う","え","お"], label: "あ行" },
  { key: "ka", row: ["か","き","く","け","こ"], label: "か行" },
  { key: "sa", row: ["さ","し","す","せ","そ"], label: "さ行" },
  { key: "ta", row: ["た","ち","つ","て","と"], label: "た行" },
  { key: "na", row: ["な","に","ぬ","ね","の"], label: "な行" },
  { key: "ha", row: ["は","ひ","ふ","へ","ほ"], label: "は行" },
  { key: "ma", row: ["ま","み","む","め","も"], label: "ま行" },
  { key: "ya", row: ["や", "", "ゆ", "", "よ"], label: "や行" },
  { key: "ra", row: ["ら","り","る","れ","ろ"], label: "ら行" },
  { key: "wa", row: ["わ", "", "を", "", "ん"], label: "わ行" },
] as const;

const K_ROWS = [
  { key: "a",  row: ["ア","イ","ウ","エ","オ"], label: "ア行" },
  { key: "ka", row: ["カ","キ","ク","ケ","コ"], label: "カ行" },
  { key: "sa", row: ["サ","シ","ス","セ","ソ"], label: "サ行" },
  { key: "ta", row: ["タ","チ","ツ","テ","ト"], label: "タ行" },
  { key: "na", row: ["ナ","ニ","ヌ","ネ","ノ"], label: "ナ行" },
  { key: "ha", row: ["ハ","ヒ","フ","ヘ","ホ"], label: "ハ行" },
  { key: "ma", row: ["マ","ミ","ム","メ","モ"], label: "マ行" },
  { key: "ya", row: ["ヤ", "", "ユ", "", "ヨ"], label: "ヤ行" },
  { key: "ra", row: ["ラ","リ","ル","レ","ロ"], label: "ラ行" },
  { key: "wa", row: ["ワ", "", "ヲ", "", "ン"], label: "ワ行" },
] as const;

function useKanaTable(script: Script) {
  return useMemo(() => (script === "katakana" ? K_ROWS : H_ROWS), [script]);
}

/* ---------- Page ---------- */

export default function PracticeScriptPage() {
  const params = useParams<{ script: string }>();
  const router = useRouter();

  const raw = params?.script ?? "";
  const validScript: Script | null =
    raw === "hiragana" || raw === "katakana" ? (raw as Script) : null;

  useEffect(() => {
    if (!validScript) router.replace("/practice");
  }, [validScript, router]);
  if (!validScript) return null;

  const rows = useKanaTable(validScript);

  const [pen, setPen] = useState(4);
  const [ghost, setGhost] = useState(true);
  const [rowIdx, setRowIdx] = useState(0);

  // เก็บเส้นแบบถาวรต่อช่อง: key = `${script}:${rowIdx}:${r}:${c}`
  const storeRef = useRef<Record<string, Stroke[]>>({});

  const keyOf = (r: number, c: number) =>
    `${validScript}:${rowIdx}:${r}:${c}`;

  const getStrokes = (r: number, c: number) =>
    storeRef.current[keyOf(r, c)] ?? [];

  const setStrokes = (r: number, c: number, s: Stroke[]) => {
    storeRef.current[keyOf(r, c)] = s;
  };

  // คงตำแหน่ง 5 ช่องเสมอ
  const colChars = useMemo(
    () => rows[rowIdx].row.map((ch) => (ch ? ch.replace(/\(|\)/g, "") : "")),
    [rows, rowIdx]
  );

  const clearAll = () => {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 5; c++) {
        setStrokes(r, c, []);
      }
    }
    // บังคับรีเฟรชโดยเปลี่ยน state เล็กน้อย (toggle ghost สั้น ๆ)
    setGhost((g) => !g);
    setTimeout(() => setGhost((g) => !g), 0);
  };

  /* ---------- HOTFIX: เปิดลิงก์แท็บใหม่ + ปิดแท็บเดิม ---------- */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      e.preventDefault();
      try { window.open(href, "_blank", "noopener,noreferrer"); } catch {}
      setTimeout(() => {
        try { window.open("", "_self"); window.close(); } catch {}
        try { window.location.replace("about:blank"); } catch {}
      }, 10);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true } as any);
  }, []);

  return (
    <main className="max-w-6xl mx-auto p-6">
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Link href="/flashcards" className="text-blue-600 underline">กลับ</Link>
        <span className="text-slate-400">/</span>
        <span className="font-medium">
          {validScript === "hiragana" ? "ฮิรางานะ (Hiragana)" : "คาตะคานะ (Katakana)"}
        </span>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* ซ้าย: เลือกแถว (行) */}
        <aside className="col-span-12 md:col-span-3 lg:col-span-2">
          <div className="rounded-xl border bg-white overflow-hidden">
            <div className="px-3 py-2 border-b text-sm font-medium">แถว (行)</div>
            <ul className="max-h-[520px] overflow-auto">
              {rows.map((r, i) => (
                <li key={r.key}>
                  <button
                    onClick={() => setRowIdx(i)}
                    className={`w-full text-left px-3 py-2 border-b hover:bg-slate-50 ${
                      i === rowIdx ? "bg-blue-50 font-medium" : ""
                    }`}
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* ขวา: ตาราง 5x6 */}
        <section className="col-span-12 md:col-span-9 lg:col-span-10">
          <div className="rounded-xl border bg-white p-3 mb-3 flex flex-wrap items-center gap-4">
            <div className="text-sm text-slate-600">
              แถวปัจจุบัน: <span className="font-medium">{rows[rowIdx].label}</span>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span>ความหนาปากกา</span>
              <input
                type="range"
                min={2}
                max={12}
                value={pen}
                onChange={(e) => setPen(parseInt(e.target.value, 10))}
              />
              <span className="w-10 text-right">{pen}px</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ghost}
                onChange={(e) => setGhost(e.target.checked)}
              />
              แสดงตัวอย่างจาง ๆ
            </label>
            <button
              onClick={clearAll}
              className="px-3 py-1.5 rounded-lg border hover:bg-slate-50 text-sm"
            >
              Clear ทั้งตาราง
            </button>
          </div>

          <div className="rounded-xl border bg-white p-3">
            <div className="grid grid-cols-5 gap-3">
              {Array.from({ length: 6 }, (_, r) =>
                colChars.map((colChar, c) => (
                  <div
                    key={`${validScript}-${rowIdx}-${r}-${c}`}
                    className="relative rounded-lg border overflow-hidden bg-gray-50"
                    style={{ aspectRatio: "1 / 1" }}
                  >
                    <MiniCanvas
                      ghostChar={colChar}
                      pen={pen}
                      showGhost={ghost}
                      strokes={getStrokes(r, c)}
                      onChange={(s) => setStrokes(r, c, s)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/* ---------- MiniCanvas (หนึ่งช่อง) ---------- */

type MiniCanvasProps = {
  ghostChar: string;
  pen: number;
  showGhost: boolean;
  strokes: Stroke[];                        // 💾 เส้นจาก store
  onChange: (s: Stroke[]) => void;          // 🔄 ส่งกลับเมื่อแก้ไข
};

export type MiniCanvasHandle = {
  clear: () => void;
};

const MiniCanvas = forwardRef<MiniCanvasHandle, MiniCanvasProps>(
  ({ ghostChar, pen, showGhost, strokes, onChange }, ref) => {
    const drawRef = useRef<HTMLCanvasElement | null>(null);
    const ghostRef = useRef<HTMLCanvasElement | null>(null);

    // เก็บ working copy ภายใน แล้ว sync จาก props เมื่อเปลี่ยน
    const strokesRef = useRef<Stroke[]>([]);
    useEffect(() => { strokesRef.current = strokes ?? []; redraw(); }, [strokes]); // sync เมื่อสลับแถว/กลับมา

    const redraw = useCallback(() => {
      const c = drawRef.current;
      if (!c) return;
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.save();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = pen;
      // วาดทุก stroke
      strokesRef.current.forEach((s) => {
        if (!s.length) return;
        const p = new Path2D();
        p.moveTo(s[0].x, s[0].y);
        for (let i = 1; i < s.length; i++) p.lineTo(s[i].x, s[i].y);
        ctx.stroke(p);
      });
      ctx.restore();
    }, [pen]);

    useImperativeHandle(ref, () => ({
      clear() {
        strokesRef.current = [];
        onChange([]); // อัปเดต store
        redraw();
      },
    }));

    /* ---------- Ghost Layer + Resize ---------- */
    useEffect(() => {
      const c = drawRef.current!;
      const g = ghostRef.current!;
      const dpr = window.devicePixelRatio || 1;

      const resize = () => {
        const rect = c.parentElement!.getBoundingClientRect();
        const size = Math.floor(rect.width);
        const px = Math.max(84, Math.min(130, Math.floor(size * 0.7)));

        c.width = size * dpr;
        c.height = size * dpr;
        c.style.width = `${size}px`;
        c.style.height = `${size}px`;

        g.width = size * dpr;
        g.height = size * dpr;
        g.style.width = `${size}px`;
        g.style.height = `${size}px`;

        c.style.touchAction = "none";

        const gctx = g.getContext("2d")!;
        gctx.save();
        gctx.scale(dpr, dpr);
        gctx.clearRect(0, 0, size, size);

        // grid
        gctx.strokeStyle = "#e5e7eb";
        gctx.lineWidth = 1;
        const step = Math.floor(size / 6);
        for (let x = 0; x <= size; x += step) {
          gctx.beginPath(); gctx.moveTo(x, 0); gctx.lineTo(x, size); gctx.stroke();
        }
        for (let y = 0; y <= size; y += step) {
          gctx.beginPath(); gctx.moveTo(0, y); gctx.lineTo(size, y); gctx.stroke();
        }

        // frame
        gctx.strokeStyle = "#94a3b8";
        gctx.lineWidth = 2;
        gctx.strokeRect(6, 6, size - 12, size - 12);

        // ghost
        if (showGhost && ghostChar) {
          gctx.globalAlpha = 0.18;
          gctx.font = `400 ${px}px 'JPHand', Arial, system-ui`;
          gctx.textAlign = "center";
          gctx.textBaseline = "middle";
          gctx.fillStyle = "#000";
          gctx.fillText(ghostChar, size / 2, size / 2 + 4);
        }
        gctx.restore();

        redraw(); // หลัง resize ให้รีวาดเส้นจาก store
      };

      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(c.parentElement!);
      return () => ro.disconnect();
    }, [ghostChar, showGhost, redraw]);

    // เปลี่ยนความหนาปากกา → วาดใหม่ทั้งหมด
    useEffect(() => { redraw(); }, [pen, redraw]);

    /* ---------- Drawing Layer ---------- */
    useEffect(() => {
      const c = drawRef.current!;
      const ctx = c.getContext("2d")!;
      let drawing = false;
      let current: Stroke | null = null;

      const getXY = (e: PointerEvent) => {
        const rect = c.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) * (c.width / rect.width),
          y: (e.clientY - rect.top) * (c.height / rect.height),
        };
      };

      const start = (e: PointerEvent) => {
        drawing = true;
        current = [];
        current.push(getXY(e));
      };

      const move = (e: PointerEvent) => {
        if (!drawing || !current) return;
        current.push(getXY(e));
        // live preview
        redraw();
        ctx.save();
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = pen;
        const p = new Path2D();
        p.moveTo(current[0].x, current[0].y);
        for (let i = 1; i < current.length; i++) p.lineTo(current[i].x, current[i].y);
        ctx.stroke(p);
        ctx.restore();
      };

      const end = () => {
        if (drawing && current) {
          strokesRef.current = [...strokesRef.current, current];
          onChange(strokesRef.current); // sync กลับ store
          current = null;
          redraw();
        }
        drawing = false;
      };

      c.addEventListener("pointerdown", start);
      c.addEventListener("pointermove", move);
      c.addEventListener("pointerup", end);
      c.addEventListener("pointerleave", end);
      c.addEventListener("pointercancel", end);

      return () => {
        drawing = false;
        current = null;
        c.removeEventListener("pointerdown", start);
        c.removeEventListener("pointermove", move);
        c.removeEventListener("pointerup", end);
        c.removeEventListener("pointerleave", end);
        c.removeEventListener("pointercancel", end);
      };
    }, [pen, redraw, onChange]);

    return (
      <div className="absolute inset-0">
        <canvas ref={ghostRef} className="block" />
        <canvas ref={drawRef} className="absolute top-0 left-0" />
      </div>
    );
  }
);
MiniCanvas.displayName = "MiniCanvas";
