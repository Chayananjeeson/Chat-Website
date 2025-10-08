// src/lib/chat-utils.ts
export const fmtTime = (ts: any) => {
  const d = ts?.toDate ? ts.toDate() : null;
  return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "...";
};

export const fmtDate = (ts: any) => {
  const d = ts?.toDate ? ts.toDate() : null;
  if (!d) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (target.getTime() === today.getTime()) return "วันนี้";
  if (target.getTime() === yesterday.getTime()) return "เมื่อวาน";
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export const getOtherUid = (cid: string, myUid?: string | null) => {
  if (!cid || !myUid) return null;
  const [a, b] = String(cid).split("_");
  return a === myUid ? b : a;
};

// บีบอัดภาพง่าย ๆ (สูง/กว้างไม่เกิน 1280px)
export async function compressImage(file: File, maxSide = 1280, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), file.type, quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}
