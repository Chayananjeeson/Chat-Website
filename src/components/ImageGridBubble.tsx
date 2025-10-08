// src/components/ImageGridBubble.tsx
"use client";
import React from "react";

export type ImageItem = { id: string; url: string; name?: string };

export default function ImageGridBubble({
  items,
  mine,
  onOpenAt,
}: {
  items: ImageItem[];
  mine: boolean;
  onOpenAt?: (index: number) => void;
}) {
  // แสดงพรีวิวสูงสุด 4 รูปในบับเบิล (ถ้าเยอะกว่านั้นโชว์ +N บนรูปสุดท้าย)
  const total = items.length;
  const show = items.slice(0, 4);
  const count = show.length;

  // กำหนด “ขนาดบับเบิล” ไม่ให้กว้างเกินไป
  // - 1 รูป: แคบลง
  // - 2–4 รูป: กว้างขึ้นนิดหน่อย แต่ยังไม่เต็มคอลัมน์
  const bubbleWidth =
    count === 1
      ? "w-[240px] sm:w-[280px] md:w-[320px]"
      : "w-[320px] sm:w-[360px] md:w-[400px]";

  // สีบับเบิลตามฝั่งผู้ส่ง
  const bubbleColor = mine ? "bg-blue-500" : "bg-slate-200";

  // layout grid
  // 1 → 1 คอลัมน์, 2 → 2 คอลัมน์, 3-4 → 2x2
  const gridCols = count === 1 ? "grid-cols-1" : "grid-cols-2";

  // ความสูงของช่อง (รักษาสัดส่วนสวย ๆ)
  const cellH = count === 1 ? "h-[200px] sm:h-[220px]" : "h-[140px] sm:h-[160px]";

  return (
    <div className={`${bubbleColor} ${bubbleWidth} rounded-2xl p-1 shadow-sm`}>
      <div className={`grid gap-1 ${gridCols}`}>
        {show.map((it, i) => {
          const isLastShown = i === show.length - 1;
          const stillMore = total > 4 && isLastShown;

          // ถ้า 1 รูป ให้ครอบทั้งแถว
          const span = count === 1 ? "col-span-2" : "";

          return (
            <button
              key={it.id}
              type="button"
              className={`relative ${cellH} ${span} rounded-xl overflow-hidden bg-white`}
              onClick={() => onOpenAt?.(i)}
              title={it.name}
            >
              <img
                src={it.url}
                alt={it.name || "image"}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {stillMore && (
                <span className="absolute inset-0 bg-black/40 text-white text-2xl font-semibold flex items-center justify-center select-none">
                  +{total - 4}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
