"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

/* ========= Types ========= */
type Script = "hiragana" | "katakana";
type Pt = { x: number; y: number; p: number }; // p: pressure (0..1) or -1 if unused
type Stroke = Pt[];
type WidthMode = "fixed" | "pressure" | "velocity";

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
  "あ":"a","い":"i","う":"u","え":"e","お":"o","ア":"a","イ":"i","ウ":"u","エ":"e","オ":"o",
  "か":"ka","き":"ki","く":"ku","け":"ke","こ":"ko","カ":"ka","キ":"ki","ク":"ku","ケ":"ke","コ":"ko",
  "さ":"sa","し":"shi","す":"su","せ":"se","そ":"so","サ":"sa","シ":"shi","ス":"su","セ":"se","ソ":"so",
  "た":"ta","ち":"chi","つ":"tsu","て":"te","と":"to","タ":"ta","チ":"chi","ツ":"tsu","テ":"te","ト":"to",
  "な":"na","に":"ni","ぬ":"nu","ね":"ne","の":"no","ナ":"na","ニ":"ni","ヌ":"nu","ネ":"ne","ノ":"no",
  "は":"ha","ひ":"hi","ふ":"fu","へ":"he","ほ":"ho","ハ":"ha","ヒ":"hi","フ":"fu","ヘ":"he","ホ":"ho",
  "ま":"ma","み":"mi","む":"mu","め":"me","も":"mo","マ":"ma","ミ":"mi","ム":"mu","メ":"me","モ":"mo",
  "や":"ya","ゆ":"yu","よ":"yo","ヤ":"ya","ユ":"yu","ヨ":"yo",
  "ら":"ra","り":"ri","る":"ru","れ":"re","ろ":"ro","ラ":"ra","リ":"ri","ル":"ru","レ":"re","ロ":"ro",
  "わ":"wa","を":"wo","ん":"n","ワ":"wa","ヲ":"wo","ン":"n",
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
const LAZY_RADIUS_PX = 8;
const TAPER_STEPS = 6;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

const widthFromPressure = (pen: number, p: number) =>
  pen * (MIN_FACTOR + (MAX_FACTOR - MIN_FACTOR) * clamp01(p));

const widthFromVelocity = (pen: number, v: number) => {
  const t = clamp01((v - SPEED_MIN) / (SPEED_MAX - SPEED_MIN));
  return widthFromPressure(pen, 1 - t);
};

/* ========= NEW: width mode & pressure smoothing ========= */
const makePressureSmoother = () => {
  let prev = 0.5;
  return (p: number) => {
    prev = lerp(prev, clamp01(p), 0.2);     // EMA กันสั่น
    const q = Math.round(prev * 20) / 20;   // quantize step 0.05
    return clamp01(q * 0.9 + 0.05);         // bound 0.05..0.95
  };
};

/* ========= Page ========= */
export default function PracticeMobilePage() {
  const params = useParams<{ script: string }>();
  const router = useRouter();
  const sp = useSearchParams();

  const raw = params?.script ?? "";
  const validScript: Script | null =
    raw === "hiragana" || raw === "katakana" ? (raw as Script) : null;
  useEffect(() => { if (!validScript) router.replace("/practice"); }, [validScript, router]);
  if (!validScript) return null;

  const rows = useKanaTable(validScript);

  const initRow = Math.max(0, Math.min(rows.length - 1, parseInt(sp.get("row") || "0", 10)));
  const [rowIdx, setRowIdx] = useState(initRow);
  const firstValidCol = rows[rowIdx].row.findIndex((ch) => ch);
  const [colIdx, setColIdx] = useState(Math.max(0, firstValidCol));
  useEffect(() => {
    if (!rows[rowIdx].row[colIdx]) {
      const i = rows[rowIdx].row.findIndex((ch) => ch);
      setColIdx(Math.max(0, i));
    }
  }, [rowIdx]); // eslint-disable-line

  const currentChar = (rows[rowIdx].row[colIdx] || "").replace(/\(|\)/g, "");
  const [pen, setPen] = useState(8);
  const [mode, setMode] = useState<WidthMode>("pressure"); // fixed | pressure | velocity
  const [ghost, setGhost] = useState(true);

  const storeRef = useRef<Record<string, Stroke[]>>({});
  const keyOf = (r: number, c: number) => `${validScript}:${r}:${c}`;
  const getStrokes = (r: number, c: number) => storeRef.current[keyOf(r, c)] ?? [];
  const setStrokes = (r: number, c: number, s: Stroke[]) => { storeRef.current[keyOf(r, c)] = s; };

  type BoardHandle = { merge: () => HTMLCanvasElement };
  const boardRef = useRef<BoardHandle | null>(null);

  const clear = () => { setStrokes(rowIdx, colIdx, []); forceRerender(); };
  const undo = () => { const s = [...getStrokes(rowIdx, colIdx)]; s.pop(); setStrokes(rowIdx, colIdx, s); forceRerender(); };
  const forceRerender = () => { setGhost((g)=>!g); setTimeout(()=>setGhost((g)=>!g),0); };
  const downloadPNG = () => {
    const out = boardRef.current?.merge(); if (!out) return;
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png"); a.download = `practice-${currentChar || "kana"}.png`; a.click();
  };

  const moveCol = (dir: -1 | 1) => {
    const row = rows[rowIdx].row;
    let i = colIdx;
    for (let step = 0; step < row.length; step++) {
      i = (i + dir + row.length) % row.length;
      if (row[i]) { setColIdx(i); break; }
    }
  };

  return (
    <main className="mx-auto max-w-[1100px] p-2 sm:p-4">
      <div className="flex items-center gap-2 text-sm mb-2">
        <Link href={`/practice/${validScript}`} className="text-blue-600 underline">กลับโหมดตาราง</Link>
        <span className="text-slate-400">/</span>
        <span className="font-medium">โหมดวาดจอใหญ่</span>
      </div>

      {/* TOOLBAR */}
      <div className="sticky top-[52px] z-20 rounded-xl border bg-white p-2 sm:p-3 mb-3">
        <div className="mb-1 sm:mb-2 text-xs sm:text-sm text-slate-600">
          แถวปัจจุบัน: <span className="font-medium">{rows[rowIdx].label}</span>
        </div>

        {/* Row group selector */}
        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-2">
          {rows.map((r, i) => (
            <button
              key={r.key}
              onClick={() => setRowIdx(i)}
              className={`h-9 sm:h-10 px-3 rounded-lg border whitespace-nowrap ${
                i===rowIdx ? "bg-blue-600 text-white border-blue-600" : "hover:bg-slate-50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Kana buttons + arrows */}
        <div className="mt-1 sm:mt-2 flex items-center gap-2">
          <button onClick={() => moveCol(-1)} className="h-9 px-3 rounded-lg border">←</button>
          <div className="flex gap-2 overflow-x-auto">
            {rows[rowIdx].row.map((ch, idx) =>
              ch ? (
                <button
                  key={idx}
                  onClick={() => setColIdx(idx)}
                  className={`min-w-[48px] h-9 sm:h-10 px-3 rounded-lg border text-lg ${
                    idx===colIdx ? "bg-blue-600 text-white border-blue-600" : "hover:bg-slate-50"
                  }`}
                >
                  {ch}
                </button>
              ) : null
            )}
          </div>
          <button onClick={() => moveCol(1)} className="h-9 px-3 rounded-lg border">→</button>
        </div>

        {/* Pen slider */}
        <div className="mt-2 flex items-center gap-2 text-xs sm:text-sm">
          <span className="hidden sm:inline">ปากกา</span>
          <input
            type="range"
            min={2}
            max={16}
            value={pen}
            onChange={(e)=>setPen(parseInt(e.target.value,10))}
            className="w-[140px] sm:w-[200px]"
          />
          <span className="w-8 sm:w-10 text-right">{pen}px</span>
        </div>

        {/* ── Controls: Desktop = right inline / Mobile = bottom row ── */}

        {/* Desktop/right */}
        <div className="hidden sm:flex mt-2 items-center gap-3 justify-end">
          <div className="flex items-center gap-1">
            <span className="px-2 text-sm">เส้น:</span>
            <button onClick={()=>setMode("fixed")} className={`px-2 py-1 rounded border ${mode==="fixed"?"bg-slate-900 text-white":"hover:bg-slate-50"}`}>Fixed</button>
            <button onClick={()=>setMode("pressure")} className={`px-2 py-1 rounded border ${mode==="pressure"?"bg-slate-900 text-white":"hover:bg-slate-50"}`}>Pressure</button>
            <button onClick={()=>setMode("velocity")} className={`px-2 py-1 rounded border ${mode==="velocity"?"bg-slate-900 text-white":"hover:bg-slate-50"}`}>Velocity</button>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={ghost} onChange={(e)=>setGhost(e.target.checked)} />
            <span>ตัวอย่าง (รูป)</span>
          </label>
          <button onClick={undo} className="h-9 px-3 rounded-lg border">Undo</button>
          <button onClick={clear} className="h-9 px-3 rounded-lg border">Clear</button>
          <button onClick={downloadPNG} className="h-9 px-3 rounded-lg border">PNG</button>
        </div>

        {/* Mobile/bottom */}
        <div className="sm:hidden mt-2 border-t pt-2 grid grid-cols-2 gap-2">
          <div className="col-span-2 flex items-center justify-center gap-2">
            <span className="px-1 text-xs">เส้น:</span>
            <button onClick={()=>setMode("fixed")} className={`px-2 py-1 rounded border text-xs ${mode==="fixed"?"bg-slate-900 text-white":"hover:bg-slate-50"}`}>Fixed</button>
            <button onClick={()=>setMode("pressure")} className={`px-2 py-1 rounded border text-xs ${mode==="pressure"?"bg-slate-900 text-white":"hover:bg-slate-50"}`}>Pressure</button>
            <button onClick={()=>setMode("velocity")} className={`px-2 py-1 rounded border text-xs ${mode==="velocity"?"bg-slate-900 text-white":"hover:bg-slate-50"}`}>Velocity</button>
          </div>
          <label className="flex items-center justify-center gap-2 text-xs">
            <input type="checkbox" checked={ghost} onChange={(e)=>setGhost(e.target.checked)} />
            <span>ตัวอย่าง (รูป)</span>
          </label>
          <div className="flex items-center justify-center gap-2">
            <button onClick={undo} className="h-9 px-3 rounded-lg border">Undo</button>
            <button onClick={clear} className="h-9 px-3 rounded-lg border">Clear</button>
            <button onClick={downloadPNG} className="h-9 px-3 rounded-lg border">PNG</button>
          </div>
        </div>
      </div>

      {/* BOARD */}
      <div className="rounded-xl border bg-white p-2 sm:p-3">
        <div
          className="
            relative w-full
            h-[64dvh] sm:h-[72dvh] md:h-[82vh] lg:h-[86vh]
            min-h-[320px]
          "
        >
          <Board
            ref={boardRef}
            script={validScript}
            char={currentChar}
            pen={pen}
            mode={mode}
            showGhost={ghost}
            strokes={getStrokes(rowIdx, colIdx)}
            onChange={(s)=>setStrokes(rowIdx, colIdx, s)}
          />
        </div>
      </div>
    </main>
  );
}

/* ========= Board ========= */
type BoardProps = {
  script: Script;
  char: string;
  pen: number;
  mode: WidthMode;
  showGhost: boolean;
  strokes: Stroke[];
  onChange: (s: Stroke[]) => void;
};
type BoardHandle = { merge: () => HTMLCanvasElement };

const Board = React.forwardRef<BoardHandle, BoardProps>(
  ({ script, char, pen, mode, showGhost, strokes, onChange }, ref) => {
    const drawRef = useRef<HTMLCanvasElement | null>(null);
    const ghostRef = useRef<HTMLCanvasElement | null>(null);

    const strokesRef = useRef<Stroke[]>([]);
    useEffect(() => { strokesRef.current = strokes ?? []; redraw(); }, [strokes]); // sync

    const pressureSmoothRef = useRef<ReturnType<typeof makePressureSmoother> | null>(null);
    if (!pressureSmoothRef.current) pressureSmoothRef.current = makePressureSmoother();

    const widthFromPair = (a: Pt, b: Pt, dt: number) => {
      if (mode === "fixed") return Math.max(0.6, pen);
      if (mode === "pressure" && a.p >= 0) {
        const sm = pressureSmoothRef.current!(a.p);
        return Math.max(0.6, widthFromPressure(pen, sm));
      }
      const v = dist(a, b) / Math.max(1, dt / 16);
      return Math.max(0.6, widthFromVelocity(pen, v));
    };

    const redraw = useCallback(() => {
      const c = drawRef.current!; const ctx = c.getContext("2d")!;
      ctx.clearRect(0,0,c.width,c.height);
      ctx.lineJoin="round"; ctx.lineCap="round"; ctx.strokeStyle="#111827";

      for (const s of strokesRef.current) {
        if (s.length<2) continue;
        const n = s.length;
        for (let i=1;i<n;i++){
          const a=s[i-1], b=s[i];
          const base = widthFromPair(a, b, 16);
          const head = Math.max(0, TAPER_STEPS - (i-1))/TAPER_STEPS;
          const tail = Math.max(0, TAPER_STEPS - (n-1-i))/TAPER_STEPS;
          const taper = 1 - Math.max(head, tail)*0.6;
          ctx.lineWidth = base * taper;
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
        }
        const end = s[n-1];
        ctx.beginPath();
        ctx.fillStyle = "#111827";
        ctx.arc(end.x, end.y, Math.max(0.6, widthFromPressure(pen, 0.7)) * 0.45, 0, Math.PI*2);
        ctx.fill();
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pen, mode]);

    React.useImperativeHandle(ref, () => ({
      merge() {
        const g = ghostRef.current!, c = drawRef.current!;
        const out = document.createElement("canvas");
        out.width = g.width; out.height = g.height;
        const o = out.getContext("2d")!;
        o.drawImage(g,0,0); o.drawImage(c,0,0);
        return out;
      }
    }));

    // ghost + resize
    useEffect(()=>{
      const c=drawRef.current!, g=ghostRef.current!, dpr=window.devicePixelRatio||1;
      const resize=()=>{
        const rect=c.parentElement!.getBoundingClientRect();
        const W=Math.floor(rect.width), H=Math.floor(rect.height);
        const size=Math.min(W,H);
        const px=Math.floor(size*0.62);

        c.width=W*dpr; c.height=H*dpr; c.style.width=`${W}px`; c.style.height=`${H}px`;
        g.width=W*dpr; g.height=H*dpr; g.style.width=`${W}px`; g.style.height=`${H}px`;
        c.style.touchAction="none";

        const gctx=g.getContext("2d")!;
        gctx.save(); gctx.scale(dpr,dpr); gctx.clearRect(0,0,W,H);
        gctx.strokeStyle="#e5e7eb"; gctx.lineWidth=1;
        const step=Math.max(24, Math.floor(size/14));
        for (let x=0;x<=W;x+=step){ gctx.beginPath(); gctx.moveTo(x,0); gctx.lineTo(x,H); gctx.stroke(); }
        for (let y=0;y<=H;y+=step){ gctx.beginPath(); gctx.moveTo(0,y); gctx.lineTo(W,y); gctx.stroke(); }
        gctx.strokeStyle="#94a3b8"; gctx.lineWidth=2; gctx.strokeRect(8,8,W-16,H-16);

        if (showGhost && char) {
          const url = strokeImgURL(script, char);
          if (url) {
            const drawImg = (img: HTMLImageElement) => {
              const pad = Math.floor(Math.min(W, H) * 0.06);
              const side = Math.min(W, H) - pad * 2;
              const x = Math.floor((W - side) / 2);
              const y = Math.floor((H - side) / 2);
              gctx.globalAlpha = 1;
              gctx.drawImage(img, x, y, side, side);
            };
            const ready = getImage(url, () => resize());
            if (ready) drawImg(ready);
          } else {
            gctx.globalAlpha=0.18;
            gctx.font = `400 ${px}px 'JPHand',Arial,system-ui`;
            gctx.textAlign="center"; gctx.textBaseline="middle"; gctx.fillStyle="#000";
            gctx.fillText(char, W/2, H/2 + Math.floor(px*0.03));
          }
        }

        gctx.restore();
        redraw();
      };
      resize(); const ro=new ResizeObserver(resize); ro.observe(c.parentElement!);
      return ()=>ro.disconnect();
    }, [script, char, showGhost, redraw]);

    // drawing
    useEffect(()=>{
      const c=drawRef.current!, ctx=c.getContext("2d")!;
      let drawing=false; let current:Stroke|null=null;
      let last:Pt|null=null, target:Pt|null=null, lastTs=0;

      const getXY=(e:PointerEvent):Pt=>{
        const r=c.getBoundingClientRect();
        const x=(e.clientX-r.left)*(c.width/r.width);
        const y=(e.clientY-r.top)*(c.height/r.height);

        let pRaw = e.pointerType==="pen" ? (Number.isFinite(e.pressure)?e.pressure:0.5) : -1;
        if (mode === "fixed" || mode === "velocity") pRaw = -1;
        else if (mode === "pressure") {
          if (pRaw >= 0) pRaw = (pressureSmoothRef.current ?? makePressureSmoother())(pRaw);
          else pRaw = 0.5;
        }
        return {x,y,p:pRaw};
      };

      const start=(e:PointerEvent)=>{
        drawing=true; current=[];
        const pt=getXY(e); last={...pt}; target={...pt}; lastTs=performance.now();
        current.push({...pt});
      };

      const move=(e:PointerEvent)=>{
        if(!drawing||!current||!last) return;
        target=getXY(e); const now=performance.now(); const dt=Math.max(1, now-lastTs);
        let s=last; const distance=Math.hypot(last.x-target.x,last.y-target.y);
        const step=Math.max(1,LAZY_RADIUS_PX); const steps=Math.ceil(distance/step);

        for(let i=0;i<steps;i++){
          s={
            x: lerp(s.x,target.x,SMOOTHING),
            y: lerp(s.y,target.y,SMOOTHING),
            p: target.p>=0 ? lerp(s.p>=0 ? s.p : target.p, target.p, SMOOTHING) : -1
          };
          current.push({...s});
        }
        last=s; lastTs=now;

        ctx.save(); ctx.lineJoin="round"; ctx.lineCap="round"; ctx.strokeStyle="#111827";
        for(let i=Math.max(1, current.length-steps); i<current.length; i++){
          const a=current[i-1], b=current[i];
          const v = dist(a,b)/Math.max(1,dt/16);
          const base = (mode==="fixed") ? Math.max(0.5, pen) : widthFromVelocity(pen, v);
          const vw = mode==="pressure" && a.p>=0 ? Math.max(0.5, widthFromPressure(pen, a.p)) : base;
          const taper = i < TAPER_STEPS ? 1 - ((TAPER_STEPS - i)/TAPER_STEPS)*0.6 : 1;
          ctx.lineWidth=Math.max(0.5, vw*taper);
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
        }
        ctx.restore();
      };

      const end=()=>{
        if(drawing && current){
          strokesRef.current=[...strokesRef.current, current];
          const endPt = current[current.length-1];
          ctx.save();
          ctx.fillStyle = "#111827";
          const endR = Math.max(0.6, widthFromPressure(pen, 0.7)) * 0.45;
          ctx.beginPath(); ctx.arc(endPt.x, endPt.y, endR, 0, Math.PI*2); ctx.fill();
          ctx.restore();

          onChange(strokesRef.current);
          redraw();
        }
        drawing=false; last=target=null; current=null;
      };

      c.addEventListener("pointerdown",start);
      c.addEventListener("pointermove",move);
      c.addEventListener("pointerup",end);
      c.addEventListener("pointerleave",end);
      c.addEventListener("pointercancel",end);
      return ()=>{ c.removeEventListener("pointerdown",start); c.removeEventListener("pointermove",move); c.removeEventListener("pointerup",end); c.removeEventListener("pointerleave",end); c.removeEventListener("pointercancel",end); };
    }, [pen, mode, onChange, redraw]);

    return (
      <div className="absolute inset-0">
        <canvas ref={ghostRef} className="block" />
        <canvas ref={drawRef} className="absolute inset-0" />
      </div>
    );
  }
);
Board.displayName = "Board";
