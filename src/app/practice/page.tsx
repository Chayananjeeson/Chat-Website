"use client";

import Link from "next/link";

export default function PracticeIndex() {
  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">ฝึกเขียน</h1>
      <div className="grid sm:grid-cols-2 gap-3">
        <Link href="/practice/hiragana" className="rounded-xl border p-4 hover:bg-slate-50">
          <div className="text-lg font-medium">ฮิรางานะ (Hiragana)</div>
          <div className="text-sm text-slate-500">あ い う え お …</div>
        </Link>
        <Link href="/practice/katakana" className="rounded-xl border p-4 hover:bg-slate-50">
          <div className="text-lg font-medium">คาตะคานะ (Katakana)</div>
          <div className="text-sm text-slate-500">ア イ ウ エ オ …</div>
        </Link>
      </div>
    </main>
  );
}
