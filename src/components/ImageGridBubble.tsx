// src/components/ImageGridBubble.tsx
"use client";
import React, { useMemo } from "react";

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
  const total = items.length;
  const show = items.slice(0, 4);
  const count = show.length;

  const bubbleColor = mine ? "bg-blue-500" : "bg-slate-200";

  // ✅ bubble width: กันล้นมือถือ แต่ desktop ยังใกล้เดิม
  const bubbleWidth =
    count === 1
      ? "w-[78%] max-w-[320px] sm:w-[280px] md:w-[320px]"
      : "w-[82%] max-w-[420px] sm:w-[360px] md:w-[420px]";

  // ✅ layout ตามจำนวนรูป "ที่แสดง"
  const layout = useMemo(() => {
    if (count <= 1) return "one";
    if (count === 2) return "two";
    if (count === 3) return "three"; // ✅ 3 ช่องจริง
    return "four"; // 4 รูป
  }, [count]);

  const gridClass =
    layout === "one"
      ? "grid-cols-1"
      : layout === "two"
      ? "grid-cols-2"
      : layout === "three"
      ? "grid-cols-3"
      : "grid-cols-2";

  /**
   * ✅ aspect ช่วยให้ไม่พัง/ไม่ย้วย
   * - 1 รูป: ใหญ่หน่อย
   * - 2 รูป: สี่เหลี่ยม
   * - 3 รูป: สี่เหลี่ยม (จะดูเป็น strip สวย ๆ)
   * - 4 รูป: สี่เหลี่ยม
   */
  const cellBase =
    layout === "one" ? "aspect-[4/3] sm:aspect-[3/2]" : "aspect-square";

  return (
    <div className={`${bubbleColor} ${bubbleWidth} rounded-2xl p-1 shadow-sm`}>
      <div className={`grid gap-1 ${gridClass}`}>
        {show.map((it, i) => {
          const isLastShown = i === show.length - 1;
          const stillMore = total > 4 && isLastShown;

          return (
            <button
              key={it.id}
              type="button"
              className={`relative ${cellBase} rounded-xl overflow-hidden bg-white`}
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
