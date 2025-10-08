// src/components/Lightbox.tsx
"use client";
import { useEffect } from "react";

type Item = { url: string; name?: string };

export default function Lightbox({
  open,
  items,
  index,
  onClose,
  onIndexChange,
}: {
  open: boolean;
  items: Item[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndexChange(Math.min(items.length - 1, index + 1));
      if (e.key === "ArrowLeft") onIndexChange(Math.max(0, index - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, index, items.length, onClose, onIndexChange]);

  if (!open) return null;
  const curr = items[index];

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <img
          src={curr.url}
          alt={curr.name || ""}
          className="max-h-[80vh] max-w-[90vw] rounded-lg shadow-lg"
        />
      </div>

      {/* controls */}
      <div className="absolute inset-y-0 left-0 w-16 flex items-center justify-center">
        <button
          onClick={() => onIndexChange(Math.max(0, index - 1))}
          className="text-white text-2xl px-3 py-2 hover:bg-white/10 rounded"
          aria-label="previous"
        >
          ‹
        </button>
      </div>
      <div className="absolute inset-y-0 right-0 w-16 flex items-center justify-center">
        <button
          onClick={() => onIndexChange(Math.min(items.length - 1, index + 1))}
          className="text-white text-2xl px-3 py-2 hover:bg-white/10 rounded"
          aria-label="next"
        >
          ›
        </button>
      </div>
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-white text-xl px-3 py-1.5 rounded bg-white/10"
        aria-label="close"
      >
        ✕
      </button>

      {/* thumbs */}
      <div className="p-3 border-t border-white/10 overflow-x-auto">
        <div className="flex gap-2">
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => onIndexChange(i)}
              className={`h-16 aspect-square rounded overflow-hidden border ${
                i === index ? "border-white" : "border-white/30"
              }`}
              title={it.name || `image ${i + 1}`}
            >
              <img src={it.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
