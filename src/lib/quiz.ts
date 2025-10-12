export type Media = { text?: string; dataUrl?: string };
export type Choice = { id: string; media: Media; correct: boolean };

// ⬇️ ใหม่: ชนิดคำถาม
export type QuestionType = "choice" | "input";

export type QuizQuestion = {
  id: string;
  type: QuestionType;        // ⬅️ ใหม่: "choice" (ตัวเลือก 4 ตัว) หรือ "input" (พิมพ์คำตอบ)
  timeLimitSec: number;      // เวลาตอบ (วินาที)
  readTimeSec?: number;      // เวลาช่วงอ่าน (วินาที) – ถ้าไม่กำหนด default = 5
  media: Media;              // ข้อความ/รูปของคำถาม

  // สำหรับแบบตัวเลือก
  choices?: [Choice, Choice, Choice, Choice];

  // สำหรับแบบพิมพ์คำตอบ
  answers?: string[];        // รายการคำตอบที่ถูกได้ (เพิ่มได้หลายอัน เช่น คานะ + โรมาจิ)
};

export type Quiz = {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  questions: QuizQuestion[];
};

const KEY = "kenchat_quizzes_v1";

export function loadQuizzes(): Quiz[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    return raw ? (JSON.parse(raw) as Quiz[]) : [];
  } catch {
    return [];
  }
}
export function saveQuizzes(quizzes: Quiz[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(quizzes));
  }
}
export function saveQuiz(q: Quiz) {
  const list = loadQuizzes();
  const idx = list.findIndex((x) => x.id === q.id);
  if (idx >= 0) list[idx] = q; else list.push(q);
  saveQuizzes(list);
}
export function uuid() {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}
