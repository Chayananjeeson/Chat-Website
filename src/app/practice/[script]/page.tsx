"use client";

import Link from "next/link";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useParams, useRouter } from "next/navigation";

/* ========= Types ========= */
type Script = "hiragana" | "katakana";
export type Pt = { x: number; y: number; p: number };
export type Stroke = Pt[];

/* ========= Kana rows ========= */
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

const useKanaTable = (script: Script) =>
  useMemo(() => (script === "katakana" ? K_ROWS : H_ROWS), [script]);

/* ========= Stroke image helpers ========= */
const kanaToRomaji: Record<string, string> = {
  // vowels
  "あ":"a","い":"i","う":"u","え":"e","お":"o",
  "ア":"a","イ":"i","ウ":"u","エ":"e","オ":"o",
  // k
  "か":"ka","き":"ki","く":"ku","け":"ke","こ":"ko",
  "カ":"ka","キ":"ki","ク":"ku","ケ":"ke","コ":"ko",
  // s
  "さ":"sa","し":"shi","す":"su","せ":"se","そ":"so",
  "サ":"sa","シ":"shi","ス":"su","セ":"se","ソ":"so",
  // t
  "た":"ta","ち":"chi","つ":"tsu","て":"te","と":"to",
  "タ":"ta","チ":"chi","ツ":"tsu","テ":"te","ト":"to",
  // n
  "な":"na","に":"ni","ぬ":"nu","ね":"ne","の":"no",
  "ナ":"na","ニ":"ni","ヌ":"nu","ネ":"ne","ノ":"no",
  // h
  "は":"ha","ひ":"hi","ふ":"fu","へ":"he","ほ":"ho",
  "ハ":"ha","ヒ":"hi","フ":"fu","ヘ":"he","ホ":"ho",
  // m
  "ま":"ma","み":"mi","む":"mu","め":"me","も":"mo",
  "マ":"ma","ミ":"mi","ム":"mu","メ":"me","モ":"mo",
  // y
  "や":"ya","ゆ":"yu","よ":"yo",
  "ヤ":"ya","ユ":"yu","ヨ":"yo",
  // r
  "ら":"ra","り":"ri","る":"ru","れ":"re","ろ":"ro",
  "ラ":"ra","リ":"ri","ル":"ru","レ":"re","ロ":"ro",
  // w + n
  "わ":"wa","を":"wo","ん":"n",
  "ワ":"wa","ヲ":"wo","ン":"n",
};
function strokeImgURL(script: Script, ch: string): string | null {
  const slug = kanaToRomaji[ch];
  if (!slug) return null;
  const folder = script === "katakana" ? "katakana" : "hiragana";
  return `/flashcards/strokepic/${folder}/${slug}.png`;
}
const _imgCache = new Map<string, HTMLImageElement | "loading" | "error">();
function getImage(url: string, onReady: () => void): HTMLImageElement | null {
  const hit = _imgCache.get(url);
  if (hit && hit !== "loading" && hit !== "error") {
    const img = hit as HTMLImageElement;
    if (img.complete) return img;
  }
  if (hit === "loading") return null;
  const img = new Image();
  img.onload = () => { _imgCache.set(url, img); onReady(); };
  img.onerror = () => _imgCache.set(url, "error");
  _imgCache.set(url, "loading");
  img.src = url;
  return null;
}

/* ========= Brush helpers ========= */
const MIN_FACTOR = 0.35;
const MAX_FACTOR = 1.45;
const SPEED_MIN = 0.05;
const SPEED_MAX = 1.2;
const SMOOTHING = 0.25;
const LAZY_RADIUS_PX = 6;
const TAPER_STEPS = 6;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const distance = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const widthFromPressure = (pen: number, p: number) =>
  pen * (MIN_FACTOR + (MAX_FACTOR - MIN_FACTOR) * clamp01(p));
const widthFromVelocity = (pen: number, v: number) => {
  const t = clamp01((v - SPEED_MIN) / (SPEED_MAX - SPEED_MIN));
  return widthFromPressure(pen, 1 - t);
};

/* ========= Page ========= */
export default function PracticeScriptPage() {
  const params = useParams<{ script: string }>();
  const router = useRouter();
  const raw = params?.script ?? "";
  const validScript: Script | null =
    raw === "hiragana" || raw === "katakana" ? (raw as Script) : null;

  useEffect(() => { if (!validScript) router.replace("/practice"); }, [validScript, router]);
  if (!validScript) return null;

  const rows = useKanaTable(validScript);

  const [pen, setPen] = useState(4);
  const [ghost, setGhost] = useState(true);
  const [showOrder, setShowOrder] = useState(false); // (ตอนนี้ไม่ใช้ เพราะเปลี่ยนเป็นรูปทั้งหมด)
  const [rowIdx, setRowIdx] = useState(0);

  const storeRef = useRef<Record<string, Stroke[]>>({});
  const keyOf = (r: number, c: number) => `${validScript}:${rowIdx}:${r}:${c}`;
  const getStrokes = (r: number, c: number) => storeRef.current[keyOf(r, c)] ?? [];
  const setStrokes = (r: number, c: number, s: Stroke[]) => { storeRef.current[keyOf(r, c)] = s; };

  const colChars = useMemo(
    () => rows[rowIdx].row.map((ch) => (ch ? ch.replace(/\(|\)/g, "") : "")),
    [rows, rowIdx]
  );

  const clearAll = () => {
    for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) setStrokes(r, c, []);
    setGhost((g) => !g); setTimeout(() => setGhost((g) => !g), 0);
  };

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
        {/* ซ้าย: เลือกแถว */}
        <aside className="col-span-12 md:col-span-3 lg:col-span-2">
          <div className="rounded-xl border bg-white overflow-hidden">
            <div className="px-3 py-2 border-b text-sm font-medium">แถว (行)</div>
            <ul className="max-h-[520px] overflow-auto">
              {rows.map((r, i) => (
                <li key={r.key}>
                  <button
                    onClick={() => setRowIdx(i)}
                    className={`w-full text-left px-3 py-2 border-b hover:bg-slate-50 ${
                      i===rowIdx ? "bg-blue-50 font-medium" : ""
                    }`}
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* ขวา: ตาราง */}
        <section className="col-span-12 md:col-span-9 lg:col-span-10">
          <div className="rounded-xl border bg-white p-3 mb-3 flex flex-wrap items-center gap-4">
            <div className="text-sm text-slate-600">
              แถวปัจจุบัน: <span className="font-medium">{rows[rowIdx].label}</span>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span>ความหนาปากกา</span>
              <input type="range" min={2} max={12} value={pen} onChange={(e)=>setPen(parseInt(e.target.value,10))}/>
              <span className="w-10 text-right">{pen}px</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ghost} onChange={(e)=>setGhost(e.target.checked)} />
              แสดงตัวอย่าง (รูป)
            </label>
            <button onClick={clearAll} className="px-3 py-1.5 rounded-lg border hover:bg-slate-50 text-sm">
              Clear ทั้งตาราง
            </button>
            <Link
              href={`/practice/${validScript}/mobile?row=${rowIdx}`}
              target="_blank" rel="noopener noreferrer"
              className="ml-auto px-3 py-1.5 rounded-lg border hover:bg-slate-50 text-sm"
            >
              โหมดวาดในโทรศัพท์
            </Link>
          </div>

          <div className="rounded-xl border bg-white p-3">
            <div className="grid grid-cols-5 gap-3">
              {Array.from({ length: 6 }, (_, r) =>
                colChars.map((colChar, c) => (
                  <div key={`${validScript}-${rowIdx}-${r}-${c}`} className="relative rounded-lg border overflow-hidden bg-gray-50" style={{ aspectRatio: "1 / 1" }}>
                    <MiniCanvas
                      script={validScript}
                      ghostChar={colChar}
                      pen={pen}
                      showGhost={ghost}
                      showOrder={showOrder}
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

/* ========= MiniCanvas ========= */

type MiniCanvasProps = {
  script: Script;
  ghostChar: string;
  pen: number;
  showGhost: boolean;
  showOrder: boolean;           // (ไม่ได้ใช้แล้ว แต่เก็บไว้เผื่ออนาคต)
  strokes: Stroke[];
  onChange: (s: Stroke[]) => void;
};

export type MiniCanvasHandle = { clear: () => void };

const MiniCanvas = forwardRef<MiniCanvasHandle, MiniCanvasProps>(
  ({ script, ghostChar, pen, showGhost, strokes, onChange }, ref) => {
    const drawRef = useRef<HTMLCanvasElement | null>(null);
    const ghostRef = useRef<HTMLCanvasElement | null>(null);
    const sizeRef = useRef<number>(0);

    const strokesRef = useRef<Stroke[]>([]);
    useEffect(() => { strokesRef.current = strokes ?? []; redraw(); }, [strokes]);

    const redraw = useCallback(() => {
      const c = drawRef.current; if (!c) return;
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = "#111827";

      for (const s of strokesRef.current) {
        if (s.length < 2) continue;
        const n = s.length;
        const taper = (i: number) => {
          const head = Math.max(0, TAPER_STEPS - i) / TAPER_STEPS;
          const tail = Math.max(0, TAPER_STEPS - (n - 1 - i)) / TAPER_STEPS;
          return 1 - Math.max(head, tail) * 0.7;
        };
        for (let i = 1; i < n; i++) {
          const a = s[i - 1], b = s[i];
          const v = distance(a, b) / 16;
          const base = a.p >= 0 ? widthFromPressure(pen, a.p) : widthFromVelocity(pen, v);
          ctx.lineWidth = Math.max(0.5, base * taper(i - 1));
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }, [pen]);

    useImperativeHandle(ref, () => ({
      clear() { strokesRef.current = []; onChange([]); redraw(); },
    }));

    // Ghost + Resize (วาดกริด + รูป stroke order)
    useEffect(() => {
      const c = drawRef.current!, g = ghostRef.current!, dpr = window.devicePixelRatio || 1;

      const resize = () => {
        const rect = c.parentElement!.getBoundingClientRect();
        const size = Math.floor(rect.width);
        sizeRef.current = size;

        c.width = size * dpr; c.height = size * dpr;
        c.style.width = `${size}px`; c.style.height = `${size}px`;
        g.width = size * dpr; g.height = size * dpr;
        g.style.width = `${size}px`; g.style.height = `${size}px`;
        c.style.touchAction = "none";

        const gctx = g.getContext("2d")!;
        gctx.save(); gctx.scale(dpr, dpr); gctx.clearRect(0, 0, size, size);

        // grid
        gctx.strokeStyle = "#e5e7eb"; gctx.lineWidth = 1;
        const step = Math.floor(size / 6);
        for (let x = 0; x <= size; x += step) { gctx.beginPath(); gctx.moveTo(x, 0); gctx.lineTo(x, size); gctx.stroke(); }
        for (let y = 0; y <= size; y += step) { gctx.beginPath(); gctx.moveTo(0, y); gctx.lineTo(size, y); gctx.stroke(); }

        // frame
        gctx.strokeStyle = "#94a3b8"; gctx.lineWidth = 2; gctx.strokeRect(6, 6, size - 12, size - 12);

        // stroke-order image
        if (ghostChar && showGhost) {
          const url = strokeImgURL(script, ghostChar);
          if (url) {
            const drawImg = (img: HTMLImageElement) => {
              const pad = Math.floor(size * 0.06);
              const side = size - pad * 2;
              gctx.globalAlpha = 1;
              gctx.drawImage(img, pad, pad, side, side);
            };
            const ready = getImage(url, () => resize());
            if (ready) drawImg(ready);
          }
        }

        gctx.restore();
        redraw();
      };

      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(c.parentElement!);
      return () => ro.disconnect();
    }, [script, ghostChar, showGhost, redraw]);

    // Drawing layer
    useEffect(() => {
      const c = drawRef.current!, ctx = c.getContext("2d")!;
      let drawing = false; let current: Stroke | null = null;
      let last: Pt | null = null; let target: Pt | null = null; let lastTs = 0;

      const getXY = (e: PointerEvent): Pt => {
        const r = c.getBoundingClientRect();
        const x = (e.clientX - r.left) * (c.width / r.width);
        const y = (e.clientY - r.top) * (c.height / r.height);
        const p = e.pointerType === "pen" ? (Number.isFinite(e.pressure) ? e.pressure : 0.5) : -1;
        return { x, y, p };
      };
      const start = (e: PointerEvent) => { drawing = true; current = []; const pt = getXY(e); last = { ...pt }; target = { ...pt }; lastTs = performance.now(); current.push({ ...pt }); };
      const move  = (e: PointerEvent) => {
        if (!drawing || !current || !last) return;
        target = getXY(e); const now = performance.now(); const dt = Math.max(1, now - lastTs);
        let s = last; const D = Math.hypot(last.x - target.x, last.y - target.y);
        const step = Math.max(1, LAZY_RADIUS_PX); const steps = Math.ceil(D / step);
        for (let i = 0; i < steps; i++) {
          s = { x: lerp(s.x, target.x, SMOOTHING), y: lerp(s.y, target.y, SMOOTHING), p: target.p >= 0 ? lerp(s.p >= 0 ? s.p : target.p, target.p, SMOOTHING) : -1 };
          current.push({ ...s });
        }
        last = s; lastTs = now;

        // live
        redraw();
        ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = "#111827";
        for (let i = 1; i < current.length; i++) {
          const a = current[i - 1], b = current[i];
          const v = distance(a, b) / Math.max(1, dt / 16);
          const base = a.p >= 0 ? widthFromPressure(pen, a.p) : widthFromVelocity(pen, v);
          const taper = i < TAPER_STEPS ? 1 - ((TAPER_STEPS - i) / TAPER_STEPS) * 0.7 : 1;
          ctx.lineWidth = Math.max(0.5, base * taper);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.restore();
      };
      const end   = () => { if (drawing && current) { strokesRef.current = [...strokesRef.current, current]; onChange(strokesRef.current); redraw(); } drawing = false; last = target = null; current = null; };

      c.addEventListener("pointerdown", start);
      c.addEventListener("pointermove",  move);
      c.addEventListener("pointerup",    end);
      c.addEventListener("pointerleave", end);
      c.addEventListener("pointercancel",end);
      return () => {
        c.removeEventListener("pointerdown", start);
        c.removeEventListener("pointermove",  move);
        c.removeEventListener("pointerup",    end);
        c.removeEventListener("pointerleave", end);
        c.removeEventListener("pointercancel",end);
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
