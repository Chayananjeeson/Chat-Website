// src/components/ChatRightPanel.tsx
"use client";

import React, { useMemo, useRef, useState } from "react";
import Lightbox from "@/components/Lightbox";
import { db } from "@/lib/firebase";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from "firebase/firestore";

export type UsersMap = Record<
  string,
  { displayName?: string; username?: string; email?: string; photoURL?: string }
>;

type MediaItem = { url: string; name?: string; at?: any };
type LinkItem = { url: string; at?: any; text?: string };

type Props = {
  cid: string;
  isGroup: boolean;
  meUid: string | null;
  participants: string[];
  usersMap: UsersMap;
  groupName?: string;
  groupPhoto?: string;
  canEditGroup?: boolean;

  media: MediaItem[];
  links: LinkItem[];

  onLeave?: () => Promise<void> | void;
  onChangeGroupPhoto?: (file: File) => Promise<void> | void;
  onRenameGroup?: (newName: string) => Promise<void> | void;

  // ระยะห่างจากบน (เท่าความสูง header + padding ของ main)
  stickyTop?: number;
};

const LINKS_PER_PAGE = 3;
const MEMBERS_PER_PAGE = 3;

/** แทนที่ <img src=""> ด้วย fallback ที่ไม่ error (ใช้กับรูปห้อง) */
const RoomAvatar = ({ src }: { src?: string }) => {
  if (!src) {
    return (
      <div className="w-12 h-12 rounded-full bg-slate-200 border flex items-center justify-center text-slate-500">
        room
      </div>
    );
  }
  return <img src={src} className="w-12 h-12 rounded-full object-cover border" alt="room" />;
};

const SmallAvatar = ({ src, alt }: { src?: string; alt: string }) => {
  if (!src) return <div className="w-6 h-6 rounded-full bg-slate-200 border" title={alt} />;
  return <img src={src} className="w-6 h-6 rounded-full object-cover border" alt={alt} loading="lazy" />;
};

export default function ChatRightPanel({
  cid,
  isGroup,
  meUid,
  participants,
  usersMap,
  groupName,
  groupPhoto,
  canEditGroup,
  media,
  links,
  onLeave,
  onChangeGroupPhoto,
  onRenameGroup,
  stickyTop = 0,
}: Props) {
  /* ---- MEDIA (3 ล่าสุด + Lightbox) ---- */
  const sortedMedia = useMemo(
    () => [...media].sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0)),
    [media]
  );
  const top3 = sortedMedia.slice(0, 3);
  const restCount = Math.max(0, sortedMedia.length - top3.length);

  const lbItems = useMemo(() => sortedMedia.map((m) => ({ url: m.url, name: m.name })), [sortedMedia]);
  const [lbOpen, setLbOpen] = useState(false);
  const [lbIndex, setLbIndex] = useState(0);
  const openAt = (i: number) => {
    setLbIndex(i);
    setLbOpen(true);
  };

  /* ---- LINKS (แบ่งหน้า) ---- */
  const sortedLinks = useMemo(
    () => [...links].sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0)),
    [links]
  );
  const [linkPage, setLinkPage] = useState(0);
  const totalLinkPages = Math.max(1, Math.ceil(sortedLinks.length / LINKS_PER_PAGE));
  const linkSlice = sortedLinks.slice(linkPage * LINKS_PER_PAGE, linkPage * LINKS_PER_PAGE + LINKS_PER_PAGE);

  /* ---- สมาชิก (แบ่งหน้า 3 รายการ + เพิ่มสมาชิก) ---- */
  const members = useMemo(() => [...participants], [participants]);
  const [memberPage, setMemberPage] = useState(0);
  const totalMemberPages = Math.max(1, Math.ceil(members.length / MEMBERS_PER_PAGE));
  const pageStart = memberPage * MEMBERS_PER_PAGE;
  const pageSlice = members.slice(pageStart, pageStart + MEMBERS_PER_PAGE);

  React.useEffect(() => {
    if (memberPage > totalMemberPages - 1) setMemberPage(Math.max(0, totalMemberPages - 1));
  }, [members.length]); // eslint-disable-line

  const handleLeaveClick = async () => {
    if (!isGroup) return;
    const ok = confirm("แน่ใจหรือไม่ว่าจะออกจากกลุ่มนี้?");
    if (!ok) return;
    await onLeave?.();
  };

  /* ---- เปลี่ยนรูปกลุ่ม ---- */
  const fileRef = useRef<HTMLInputElement | null>(null);
  const onPickPhoto = () => {
    if (!canEditGroup) return;
    fileRef.current?.click();
  };
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!f) return;
    await onChangeGroupPhoto?.(f);
  };

  /* ---- เปลี่ยนชื่อกลุ่ม ---- */
  const [editing, setEditing] = useState(false);
  const [pendingName, setPendingName] = useState(groupName || "");
  const startEdit = () => {
    if (!canEditGroup) return;
    setPendingName(groupName || "");
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = async () => {
    const name = pendingName.trim();
    if (!name || name === groupName) { setEditing(false); return; }
    await onRenameGroup?.(name);
    setEditing(false);
  };

  /* ---- เพิ่มสมาชิก (+) ---- */
  const [showAdd, setShowAdd] = useState(false);
  const [kw, setKw] = useState("");
  const [results, setResults] = useState<Array<{ uid: string; name: string; photoURL?: string }>>([]);
  const [addingUid, setAddingUid] = useState<string | null>(null);

  const doSearch = async () => {
    const q = kw.trim().replace(/^@/, "");
    if (!q) { setResults([]); return; }

    const out: Array<{ uid: string; name: string; photoURL?: string }> = [];
    const seen = new Set<string>();

    const q1 = query(collection(db, "users"), where("username", "==", q), limit(5));
    const s1 = await getDocs(q1);
    s1.forEach((d) => {
      if (seen.has(d.id)) return;
      seen.add(d.id);
      const u = d.data() as any;
      out.push({ uid: d.id, name: u.displayName || u.username || u.email || d.id, photoURL: u.photoURL });
    });

    if (out.length === 0 && q.includes("@")) {
      const q2 = query(collection(db, "users"), where("email", "==", q), limit(5));
      const s2 = await getDocs(q2);
      s2.forEach((d) => {
        if (seen.has(d.id)) return;
        seen.add(d.id);
        const u = d.data() as any;
        out.push({ uid: d.id, name: u.displayName || u.username || u.email || d.id, photoURL: u.photoURL });
      });
    }

    if (out.length === 0 && q.length >= 10) {
      const d = await getDoc(doc(db, "users", q));
      if (d.exists() && !seen.has(d.id)) {
        const u = d.data() as any;
        out.push({ uid: d.id, name: u.displayName || u.username || u.email || d.id, photoURL: u.photoURL });
      }
    }

    const filtered = out.filter((r) => r.uid !== meUid && !participants.includes(r.uid));
    setResults(filtered);
  };

  const addMember = async (uid: string) => {
    if (!canEditGroup) return;
    setAddingUid(uid);
    await setDoc(doc(db, "conversations", cid), { participants: arrayUnion(uid) }, { merge: true });
    setAddingUid(null);
    setShowAdd(false);
    setKw("");
    setResults([]);
  };

  /* --------- DM counterpart (ชื่อ/รูปอีกฝั่ง) --------- */
  const otherUid = useMemo(
    () => (!isGroup ? (participants.find((u) => u && u !== meUid) ?? participants[0] ?? null) : null),
    [isGroup, participants, meUid]
  );
  const other = otherUid ? usersMap[otherUid] : undefined;
  const dmName =
    (!isGroup && (other?.displayName || other?.username || other?.email)) || "แชท";
  const dmPhoto = !isGroup ? other?.photoURL : undefined;

  return (
    // กว้างคงที่คอลัมน์ขวา และ sticky ตาม header จริง
    <aside className="hidden lg:block lg:w-[360px] lg:flex-shrink-0">
      <div
        className="border rounded-lg p-4 bg-white sticky overflow-y-auto"
        style={{ top: stickyTop, maxHeight: `calc(100vh - ${stickyTop}px)` }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          {isGroup ? (
            <>
              <button
                type="button"
                className={`relative shrink-0 ${canEditGroup ? "cursor-pointer group" : "cursor-default"}`}
                onClick={onPickPhoto}
                aria-label="เปลี่ยนรูปกลุ่ม"
                title={canEditGroup ? "เปลี่ยนรูปกลุ่ม" : undefined}
              >
                <RoomAvatar src={groupPhoto || undefined} />
                {canEditGroup && (
                  <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/30 text-white text-xs rounded-full">
                    เปลี่ยนรูป
                  </span>
                )}
              </button>

              <div className="min-w-0">
                {!editing ? (
                  <div className="flex items-center gap-2">
                    <div className="font-semibold truncate">{groupName || "กลุ่มแชท"}</div>
                    {canEditGroup && (
                      <button
                        type="button"
                        onClick={startEdit}
                        title="แก้ชื่อกลุ่ม"
                        className="p-1 rounded hover:bg-slate-100 text-slate-600"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
                        </svg>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      value={pendingName}
                      onChange={(e) => setPendingName(e.target.value)}
                      className="border rounded px-2 py-1 text-sm"
                      placeholder="ชื่อกลุ่ม"
                      autoFocus
                    />
                    <button onClick={saveEdit} className="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700" title="บันทึก">✔</button>
                    <button onClick={cancelEdit} className="px-2 py-1 text-xs rounded bg-slate-200 hover:bg-slate-300" title="ยกเลิก">✖</button>
                  </div>
                )}
                <div className="text-xs text-slate-500">กลุ่ม</div>
              </div>
            </>
          ) : (
            // ===== DM Header: แสดงข้อมูล “อีกฝั่ง” =====
            <>
              <div className="shrink-0">
                {dmPhoto ? (
                  <img
                    src={dmPhoto}
                    className="w-12 h-12 rounded-full object-cover border"
                    alt={dmName}
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-full bg-slate-200 border flex items-center justify-center text-slate-700 font-medium"
                    title={dmName}
                  >
                    {(dmName || "?").trim().charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate">{dmName}</div>
                <div className="text-xs text-slate-500">ส่วนตัว</div>
              </div>
            </>
          )}
          {/* hidden file input */}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
        </div>

        {/* สมาชิกในกลุ่ม (เฉพาะกลุ่ม) */}
        {isGroup && (
          <section className="mb-6 relative">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">สมาชิกในกลุ่ม</h3>
              <div className="flex items-center gap-2 text-xs">
                {members.length > MEMBERS_PER_PAGE && (
                  <>
                    <button onClick={() => setMemberPage((p) => Math.max(0, p - 1))} className="px-2 py-1 rounded border hover:bg-slate-50 disabled:opacity-40" disabled={memberPage === 0} title="ใหม่กว่า">◀</button>
                    <span className="text-slate-500">หน้า {memberPage + 1}/{totalMemberPages}</span>
                    <button onClick={() => setMemberPage((p) => Math.min(totalMemberPages - 1, p + 1))} className="px-2 py-1 rounded border hover:bg-slate-50 disabled:opacity-40" disabled={memberPage >= totalMemberPages - 1} title="เก่ากว่า">▶</button>
                  </>
                )}

                {canEditGroup && (
                  <button onClick={() => setShowAdd((s) => !s)} className="ml-1 w-7 h-7 rounded-full border flex items-center justify-center hover:bg-slate-50" title="เพิ่มสมาชิก (+)">+</button>
                )}
              </div>
            </div>

            <ul className="space-y-2">
              {pageSlice.map((uid) => {
                const u = usersMap[uid] || {};
                const name = u.displayName || u.username || u.email || uid;
                return (
                  <li key={uid} className="flex items-center gap-2">
                    <SmallAvatar src={u.photoURL || undefined} alt={name} />
                    <span className="text-sm">{name}</span>
                  </li>
                );
              })}
            </ul>

            {/* Add member popover */}
            {showAdd && canEditGroup && (
              <div className="absolute z-20 right-0 mt-2 w-64 rounded-lg border bg-white shadow-md p-3">
                <div className="text-sm font-medium mb-2">เพิ่มสมาชิก</div>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={kw}
                    onChange={(e) => setKw(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && doSearch()}
                    placeholder="@username / email / uid"
                    className="flex-1 border rounded px-2 py-1 text-sm"
                  />
                  <button onClick={doSearch} className="px-2 py-1 rounded border text-sm hover:bg-slate-50" title="ค้นหา">ค้นหา</button>
                </div>

                {results.length === 0 ? (
                  <div className="text-xs text-slate-500">พิมพ์แล้วกดค้นหา</div>
                ) : (
                  <ul className="space-y-2 max-h-56 overflow-y-auto">
                    {results.map((r) => (
                      <li key={r.uid} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <SmallAvatar src={r.photoURL} alt={r.name} />
                          <span className="text-sm truncate" title={r.name}>{r.name}</span>
                        </div>
                        <button onClick={() => addMember(r.uid)} disabled={addingUid === r.uid} className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
                          {addingUid === r.uid ? "กำลังเพิ่ม…" : "เพิ่ม"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-2 text-right">
                  <button onClick={() => setShowAdd(false)} className="text-xs text-slate-500 hover:underline">ปิด</button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* รูปภาพ (3 ล่าสุด) */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold mb-2">รูปภาพ</h3>
          {top3.length === 0 ? (
            <div className="text-xs text-slate-500">ยังไม่มีรูปภาพ</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {top3.map((m, i) => (
                <button
                  key={`${m.url}-${i}`}
                  type="button"
                  className="relative group rounded-lg overflow-hidden border bg-white"
                  onClick={() => openAt(i)}
                  title={m.name || "รูปภาพ"}
                >
                  <img src={m.url} alt={m.name || "media"} className="w-full h-24 object-cover group-hover:opacity-90 transition" loading="lazy" />
                  {i === 2 && restCount > 0 && (
                    <div className="absolute inset-0 bg-black/50 text-white flex items-center justify-center text-lg font-semibold">
                      +{restCount}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ลิงก์ */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">ลิงก์</h3>
            {sortedLinks.length > LINKS_PER_PAGE && (
              <div className="flex items-center gap-2 text-xs">
                <button onClick={() => setLinkPage((p) => Math.max(0, p - 1))} className="px-2 py-1 rounded border hover:bg-slate-50 disabled:opacity-40" disabled={linkPage === 0} title="ใหม่กว่า">◀</button>
                <span className="text-slate-500">หน้า {linkPage + 1}/{totalLinkPages}</span>
                <button onClick={() => setLinkPage((p) => Math.min(totalLinkPages - 1, p + 1))} className="px-2 py-1 rounded border hover:bg-slate-50 disabled:opacity-40" disabled={linkPage >= totalLinkPages - 1} title="เก่ากว่า">▶</button>
              </div>
            )}
          </div>

          {sortedLinks.length === 0 ? (
            <div className="text-xs text-slate-500">ยังไม่มีลิงก์</div>
          ) : (
            <ul className="space-y-1">
              {linkSlice.map((l, i) => (
                <li key={`${l.url}-${i}`} className="text-xs truncate">
                  <a href={l.url} className="text-blue-600 hover:underline" target="_blank" rel="noreferrer" title={l.url}>
                    {l.text || l.url}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ออกจากกลุ่ม */}
        {isGroup && (
          <button onClick={handleLeaveClick} className="w-full mt-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 py-2 text-sm">
            ออกจากกลุ่ม
          </button>
        )}
      </div>

      {/* Lightbox ทั้งหมด */}
      <Lightbox open={lbOpen} items={lbItems} index={lbIndex} onClose={() => setLbOpen(false)} onIndexChange={setLbIndex} />
    </aside>
  );
}
