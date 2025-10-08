"use client";
import { useEffect, useRef, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  addDoc, collection, onSnapshot, orderBy, query, serverTimestamp,
} from "firebase/firestore";

type Msg = { id: string; text: string; uid: string; email?: string; createdAt?: any };

export default function ChatBox({ conversationId }: { conversationId: string }) {
  const user = auth.currentUser;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "conversations", conversationId, "messages"),
      orderBy("createdAt", "asc")
    );
    const off = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Msg[]);
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    return () => off();
  }, [user, conversationId]);

  const send = async () => {
    if (!user || !text.trim()) return;
    await addDoc(collection(db, "conversations", conversationId, "messages"), {
      text: text.trim(),
      uid: user.uid,
      email: user.email,
      createdAt: serverTimestamp(),
    });
    setText("");
  };

  if (!user) return null;

  return (
    <div className="h-[calc(100vh-160px)] max-w-3xl mx-auto p-4 flex flex-col">
      <div className="flex-1 overflow-y-auto rounded-xl border bg-white p-3">
        {messages.map((m) => {
          const mine = m.uid === user.uid;
          return (
            <div key={m.id} className={`flex my-1 ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`px-3 py-2 rounded-2xl max-w-[80%] text-sm ${mine ? "bg-blue-600 text-white" : "bg-slate-100"}`}>
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 border rounded-xl px-3 py-2"
          placeholder="พิมพ์ข้อความ..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button onClick={send} className="px-4 py-2 rounded-xl bg-blue-600 text-white">ส่ง</button>
      </div>
    </div>
  );
}
