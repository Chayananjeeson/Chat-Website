"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  arrayRemove,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";

import { auth, db, storage } from "@/lib/firebase";
import { fmtDate, fmtTime, getOtherUid, compressImage } from "@/lib/chat-utils";
import ImageGridBubble, { ImageItem } from "@/components/ImageGridBubble";
import Lightbox from "@/components/Lightbox";
import ChatRightPanel, { UsersMap } from "@/components/ChatRightPanel";

import data from "@emoji-mart/data";
const EmojiPicker: any = dynamic(() => import("@emoji-mart/react"), { ssr: false });

/* --------------------------------------------------------------- */
/* Types                                                           */
/* --------------------------------------------------------------- */
type PendingImage = { id: string; file: File; previewURL: string };
type Msg = any;

type Group =
  | { kind: "text"; msg: Msg; mine: boolean }
  | { kind: "imageBatch"; mine: boolean; items: (Msg & { imageURL: string })[]; id: string; lastAt: any };

type UserRow = {
  uid: string;
  displayName?: string;
  username?: string;
  email?: string;
  photoURL?: string;
};

type GroupMeta = {
  id: string;
  name?: string;
  photoURL?: string | null;
  participants: string[];
  type: "group";
};

/* --------------------------------------------------------------- */
/* Helper: render text with clickable links                        */
/* --------------------------------------------------------------- */
const renderWithLinks = (text: string): React.ReactNode => {
  if (!text) return null;

  // ใช้ rx แบ่ง "ลิงก์" ออกจากข้อความอื่น
  const splitRx = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/gi;
  // ใช้ตัวนี้สำหรับตรวจว่าเป็นลิงก์ทั้งชิ้น (เลี่ยงปัญหา lastIndex ของ /g)
  const isLinkRx = /^(https?:\/\/[^\s)]+|www\.[^\s)]+)$/i;

  const parts = text.split(splitRx);
  return parts.map((part, i) => {
    if (!part) return null;
    if (isLinkRx.test(part)) {
      const url = part.startsWith("http") ? part : `https://${part}`;
      return (
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-blue-600 hover:text-blue-800 break-words"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
};

/* --------------------------------------------------------------- */

export default function ChatPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const cid = String(id);

  const myUid = auth.currentUser?.uid || null;

  /* ===== meta ห้อง ===== */
  const [conv, setConv] = useState<any | null>(null);
  const isGroup = conv?.type === "group";

  /* ===== state หลัก ===== */
  const [messages, setMessages] = useState<Msg[]>([]);
  const [usersMap, setUsersMap] = useState<UsersMap>({});
  const [text, setText] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  // preview & upload
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // read receipts (DM)
  const [otherLastRead, setOtherLastRead] = useState<any | null>(null);

  // reads (GROUP)
  const [readsMap, setReadsMap] = useState<Record<string, any | null>>({}); // uid -> lastReadAt

  // lightbox
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItems, setViewerItems] = useState<{ url: string; name?: string }[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);

  const userUnsubsRef = useRef<Map<string, () => void>>(new Map());
  const readsUnsubRef = useRef<null | (() => void)>(null);

  /* ====== จัดตำแหน่ง/ขนาด Panel ซ้าย/ขวา ====== */
  const mainRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [stickyTop, setStickyTop] = useState(24);
  const [panelRightLeft, setPanelRightLeft] = useState<number | null>(null);
  const [panelLeftLeft, setPanelLeftLeft] = useState<number | null>(null);
  const PANEL_RIGHT_W = 360;
  const PANEL_LEFT_W = 280;
  const PANEL_GAP = 24;
  const PANEL_Y_OFFSET = 24; // ปรับตรงนี้ได้ – ให้ระดับบนเท่ากับกล่องแชท

  // คำนวณระยะจากบน (ให้ panel ติดใต้ header)
  useEffect(() => {
    const calcTop = () => {
      const header = document.getElementById("app-header");
      const headerH = header?.offsetHeight ?? 0;
      const padTop = mainRef.current
        ? parseInt(getComputedStyle(mainRef.current).paddingTop || "0", 10)
        : 0;
      // ขยับลงอีกนิดด้วย PANEL_Y_OFFSET
      setStickyTop(headerH + padTop + PANEL_Y_OFFSET);
    };
    calcTop();
    window.addEventListener("resize", calcTop);
    return () => window.removeEventListener("resize", calcTop);
  }, []);

  // คำนวณตำแหน่งของ Panel ขวา/ซ้าย (วางนอก container)
  useEffect(() => {
    const calcLR = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();

      // Right panel
      const maxLeft = window.innerWidth - PANEL_RIGHT_W - PANEL_GAP;
      const leftR = Math.min(rect.right + PANEL_GAP, maxLeft);
      setPanelRightLeft(leftR);

      // Left panel
      const minLeft = PANEL_GAP;
      const leftL = Math.max(minLeft, rect.left - PANEL_GAP - PANEL_LEFT_W);
      setPanelLeftLeft(leftL);
    };
    calcLR();
    window.addEventListener("resize", calcLR);
    return () => window.removeEventListener("resize", calcLR);
  }, []);

  /* ===== subscribe meta ห้อง ===== */
  useEffect(() => {
    if (!cid) return;
    const off = onSnapshot(doc(db, "conversations", cid), (snap) => {
      if (snap.exists()) setConv({ id: snap.id, ...(snap.data() as any) });
      else setConv(null);
    });
    return () => off();
  }, [cid]);

  const participants: string[] = useMemo(() => {
    if (conv?.participants?.length) return conv.participants as string[];
    const ids = cid.split("_");
    return ids.length >= 2 ? ids : [];
  }, [cid, conv?.participants]);

  /* ===== โหลดข้อความ ===== */
  useEffect(() => {
    if (!cid) return;
    const q = query(collection(db, "conversations", cid, "messages"), orderBy("createdAt", "asc"));
    const off = onSnapshot(q, (s) => setMessages(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => off();
  }, [cid]);

  /* ===== subscribe user โปรไฟล์ ===== */
  useEffect(() => {
    const need = new Set<string>();
    messages.forEach((m) => m.uid && need.add(m.uid));
    participants.forEach((p) => p && need.add(p));

    need.forEach((uid) => {
      if (userUnsubsRef.current.has(uid)) return;
      const uref = doc(db, "users", uid);
      const off = onSnapshot(uref, (snap) => {
        const d = snap.data() as any | undefined;
        setUsersMap((prev) => ({
          ...prev,
          [uid]: {
            displayName: d?.displayName,
            username: d?.username,
            email: d?.email,
            photoURL: d?.photoURL,
          },
        }));
      });
      userUnsubsRef.current.set(uid, off);
    });
  }, [messages, participants.join(",")]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  /* ===== picker outside click ===== */
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!pickerRef.current) return;
      if (!pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowPicker(false);
    };
    if (showPicker) {
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [showPicker]);

  /* ===== auto-resize input ===== */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  /* ===== read receipts ===== */
  useEffect(() => {
    if (!cid || !myUid) return;

    if (!isGroup) {
      const other = getOtherUid(cid, myUid);
      if (!other) return;
      readsUnsubRef.current?.();
      const rdoc = doc(db, "conversations", cid, "reads", other);
      const off = onSnapshot(rdoc, (snap) => setOtherLastRead((snap.data() as any)?.lastReadAt || null));
      readsUnsubRef.current = off;
      return () => {
        off();
        readsUnsubRef.current = null;
      };
    }

    // GROUP
    readsUnsubRef.current?.();
    const off = onSnapshot(collection(db, "conversations", cid, "reads"), (snap) => {
      const map: Record<string, any | null> = {};
      snap.forEach((d) => {
        map[d.id] = (d.data() as any)?.lastReadAt || null;
      });
      setReadsMap(map);
    });
    readsUnsubRef.current = off;
    return () => {
      off();
      readsUnsubRef.current = null;
    };
  }, [cid, myUid, isGroup]);

  const markMyRead = async () => {
    if (!cid || !myUid) return;
    await setDoc(doc(db, "conversations", cid, "reads", myUid), { lastReadAt: serverTimestamp() }, { merge: true });
  };
  useEffect(() => {
    markMyRead();
  }, [messages.length]);
  useEffect(() => {
    const onFocus = () => markMyRead();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [cid, myUid]);

  /* ===== preview helpers ===== */
  const addFilesToPreview = (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    const items = arr.map((f) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file: f,
      previewURL: URL.createObjectURL(f),
    }));
    setPendingImages((prev) => [...prev, ...items]);
  };
  const removePending = (pid: string) => {
    setPendingImages((prev) => {
      prev.forEach((p) => {
        if (p.id === pid) URL.revokeObjectURL(p.previewURL);
      });
      return prev.filter((p) => p.id !== pid);
    });
  };
  const clearPending = () => {
    setPendingImages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewURL));
      return [];
    });
  };
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const prevent = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onDrop = (e: DragEvent) => {
      prevent(e);
      if (e.dataTransfer?.files?.length) addFilesToPreview(e.dataTransfer.files);
    };
    el.addEventListener("dragover", prevent);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", prevent);
      el.removeEventListener("drop", onDrop);
    };
  }, []);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of items as any) {
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f && f.type.startsWith("image/")) files.push(f);
        }
      }
      if (files.length) addFilesToPreview(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  /* ===== ส่งข้อความ ===== */
  const sendTextOnly = async (body: string) => {
    const user = auth.currentUser;
    if (!user) return;
    await addDoc(collection(db, "conversations", cid, "messages"), {
      type: "text",
      text: body,
      uid: user.uid,
      email: user.email,
      createdAt: serverTimestamp(),
    });
    await setDoc(
      doc(db, "conversations", cid),
      { updatedAt: serverTimestamp(), lastMessage: body.slice(0, 200) },
      { merge: true }
    );
  };

  /* ===== ส่งรูป ===== */
  const uploadOneImageAndCreateMsg = async (file: File, batchId: string, batchIndex: number, batchTotal: number) => {
    const user = auth.currentUser;
    if (!user) return;
    const blob = await compressImage(file);
    const fileName = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
    const path = `conversations/${cid}/${user.uid}/${fileName}`;
    const task = uploadBytesResumable(ref(storage, path), blob);
    await new Promise<void>((resolve, reject) => {
      task.on("state_changed", undefined, reject, () => resolve());
    });
    const url = await getDownloadURL(task.snapshot.ref);
    await addDoc(collection(db, "conversations", cid, "messages"), {
      type: "image",
      batchId,
      batchIndex,
      batchTotal,
      imageURL: url,
      imageName: file.name,
      imageSize: task.snapshot.totalBytes,
      uid: user.uid,
      email: user.email,
      createdAt: serverTimestamp(),
    });
  };

  const sendAll = async () => {
    const hasText = !!text.trim();
    const hasImages = pendingImages.length > 0;
    if (!hasText && !hasImages) return;

    try {
      setUploading(true);
      setProgress(0);
      if (hasText) await sendTextOnly(text.trim());

      if (hasImages) {
        const batchId = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;
        for (let i = 0; i < pendingImages.length; i++) {
          await uploadOneImageAndCreateMsg(pendingImages[i].file, batchId, i, pendingImages.length);
          setProgress(Math.round(((i + 1) / pendingImages.length) * 100));
        }
        if (!hasText) {
          await setDoc(
            doc(db, "conversations", cid),
            {
              updatedAt: serverTimestamp(),
              lastMessage: `[รูปภาพ x${pendingImages.length}]`,
            },
            { merge: true }
          );
        }
      }

      await markMyRead();
      setText("");
      clearPending();
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const isReadByOther = (createdAt: any) => {
    if (isGroup) return false;
    const m = createdAt?.toMillis ? createdAt.toMillis() : 0;
    const o = otherLastRead?.toMillis ? otherLastRead.toMillis() : 0;
    return o >= m && m > 0;
  };

  /* ---------- Helpers ---------- */
  const getSenderUid = (gr: Group): string =>
    gr.kind === "text" ? (gr.msg as any).uid : (gr.items[0] as any).uid;
  const getCreatedAt = (gr: Group): any => (gr.kind === "text" ? (gr.msg as any).createdAt : (gr.lastAt as any));

  /* ===== group message bubbles ===== */
  const groups: Group[] = [];
  (() => {
    let i = 0;
    while (i < messages.length) {
      const m = messages[i];
      const mine = m.uid === myUid;
      if (m.type === "image" && m.batchId) {
        const batchId = m.batchId;
        const arr: any[] = [m];
        let j = i + 1;
        while (j < messages.length) {
          const n = messages[j];
          if (n.type === "image" && n.batchId === batchId && n.uid === m.uid) {
            arr.push(n);
            j++;
          } else break;
        }
        groups.push({ kind: "imageBatch", mine, items: arr, id: batchId, lastAt: arr[arr.length - 1].createdAt });
        i = j;
      } else {
        groups.push({ kind: "text", msg: m, mine });
        i++;
      }
    }
  })();

  // เวลาของแต่ละกรุ๊ป (ms)
  const groupTimes = groups.map((g) => {
    const ct = getCreatedAt(g);
    return ct?.toMillis ? ct.toMillis() : 0;
    // eslint-disable-next-line
  });

  // index ล่าสุดที่แต่ละคนอ่านถึง (GROUP)
  const lastSeenIndexByUser: Record<string, number> = useMemo(() => {
    if (!isGroup) return {};
    const map: Record<string, number> = {};
    Object.entries(readsMap).forEach(([uid, at]) => {
      const t = (at as any)?.toMillis ? (at as any).toMillis() : 0;
      let idx = -1;
      for (let i = groupTimes.length - 1; i >= 0; i--) {
        if (groupTimes[i] <= t) {
          idx = i;
          break;
        }
      }
      map[uid] = idx;
    });
    return map;
  }, [readsMap, isGroup, groupTimes.join(",")]);

  /* ===== จัดการกลุ่ม ===== */
  const handleLeave = async () => {
    if (!myUid) return;
    const cref = doc(db, "conversations", cid);
    const snap = await getDoc(cref);
    if (!snap.exists()) return;
    await updateDoc(cref, { participants: arrayRemove(myUid), updatedAt: serverTimestamp() });
  };

  const handleChangeGroupPhoto = async (file: File) => {
    const user = auth.currentUser;
    if (!user) return;
    const fileName = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
    const path = `conversations/${cid}/${user.uid}/_roomPhoto/${fileName}`;
    const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type || "image/jpeg" });
    await new Promise<void>((res, rej) => task.on("state_changed", undefined, rej, () => res()));
    const url = await getDownloadURL(task.snapshot.ref);
    await setDoc(doc(db, "conversations", cid), { photoURL: url, updatedAt: serverTimestamp() }, { merge: true });
  };

  const handleRenameGroup = async (newName: string) => {
    await setDoc(doc(db, "conversations", cid), { name: newName, updatedAt: serverTimestamp() }, { merge: true });
  };

  /* ===== สรุป media / links ส่งให้พาเนลขวา ===== */
  const media = useMemo(
    () =>
      messages
        .filter((m) => m.type === "image")
        .map((m: any) => ({ url: m.imageURL, name: m.imageName, at: m.createdAt })),
    [messages]
  );

  const links = useMemo(() => {
    const items: { url: string; at?: any; text?: string }[] = [];
    const rx = /(https?:\/\/[^\s)]+)|(www\.[^\s)]+)/gi;
    messages.forEach((m: any) => {
      if (m.type !== "text" || !m.text) return;
      const found = m.text.match(rx);
      if (found) found.forEach((u: string) => items.push({ url: u.startsWith("http") ? u : `https://${u}`, at: m.createdAt, text: m.text }));
    });
    return items;
  }, [messages]);

  /* =========================================================================================
     LEFT PANEL (โปรไฟล์เรา + รายชื่อเพื่อน + กลุ่ม) + UNREAD BADGE (แก้บั๊ก 18 ไม่หาย)
     ========================================================================================= */

  const [meUidState, setMeUidState] = useState<string | null>(myUid);
  const [meDoc, setMeDoc] = useState<UserRow | null>(null);

  const [friends, setFriends] = useState<string[]>([]);
  const [friendUsers, setFriendUsers] = useState<UserRow[]>([]);
  const [groupsList, setGroupsList] = useState<GroupMeta[]>([]);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({}); // cid -> count

  // auth + โหลด me + subscribe friends & groups
  useEffect(() => {
    const off = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setMeUidState(u.uid);
      const meSnap = await getDoc(doc(db, "users", u.uid));
      if (meSnap.exists()) setMeDoc({ uid: u.uid, ...(meSnap.data() as any) });

      // friendships ของเรา
      const qf = query(collection(db, "friendships"), where("participants", "array-contains", u.uid));
      const unsubF = onSnapshot(qf, (snap) => {
        const otherUids: string[] = [];
        snap.forEach((d) => {
          const ps = (d.data() as any).participants as string[];
          const other = ps.find((x) => x !== u.uid);
          if (other) otherUids.push(other);
        });
        setFriends(otherUids);
      });

      // groups ที่เราเป็นสมาชิก
      const qg = query(
        collection(db, "conversations"),
        where("type", "==", "group"),
        where("participants", "array-contains", u.uid)
      );
      const unsubG = onSnapshot(qg, (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as GroupMeta));
        setGroupsList(list);
      });

      return () => {
        unsubF();
        unsubG();
      };
    });
    return () => off();
  }, [router]);

  // โหลดโปรไฟล์ user ของ friends
  useEffect(() => {
    if (!meUidState) return;
    if (friends.length === 0) {
      setFriendUsers([]);
      return;
    }

    const unsubs: (() => void)[] = [];
    const map = new Map<string, UserRow>();

    friends.forEach((uid) => {
      const uref = doc(db, "users", uid);
      const u = onSnapshot(uref, (d) => {
        if (d.exists()) map.set(uid, { uid, ...(d.data() as any) });
        else map.delete(uid);
        setFriendUsers(Array.from(map.values()).sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "")));
      });
      unsubs.push(u);
    });

    return () => unsubs.forEach((fn) => fn());
  }, [friends.join(","), meUidState]);

  // ===== helper: subscribe unread ของห้องหนึ่ง (เวอร์ชันแก้บั๊ก) =====
  const watchUnreadForConv = (convId: string) => {
    if (!meUidState) return () => {};
    let lastReadAt: any = null;
    let msgs: any[] = [];

    const recalc = () => {
      const lr = lastReadAt?.toMillis ? lastReadAt.toMillis() : 0;
      let count = 0;
      for (const m of msgs) {
        const t = m.createdAt?.toMillis ? m.createdAt.toMillis() : 0;
        const isOther = m.uid && m.uid !== meUidState;
        if (isOther && t > lr) count++;
      }
      setUnreadMap((prev) => ({ ...prev, [convId]: count }));
    };

    const offRead = onSnapshot(doc(db, "conversations", convId, "reads", meUidState), (snap) => {
      lastReadAt = (snap.data() as any)?.lastReadAt || null;
      recalc();
    });

    const offMsg = onSnapshot(
      query(collection(db, "conversations", convId, "messages"), orderBy("createdAt", "asc")),
      (snap) => {
        msgs = snap.docs.map((d) => d.data());
        recalc();
      }
    );

    return () => {
      offRead();
      offMsg();
    };
  };

  // subscribe unread ทั้ง DM และ Group
  useEffect(() => {
    if (!meUidState) return;
    const cleaners: (() => void)[] = [];

    // DM
    friends.forEach((otherUid) => {
      const theCid = [meUidState, otherUid].sort().join("_");
      cleaners.push(watchUnreadForConv(theCid));
    });

    // Groups
    groupsList.forEach((g) => cleaners.push(watchUnreadForConv(g.id)));

    return () => cleaners.forEach((fn) => fn());
  }, [meUidState, friends.join(","), groupsList.map((g) => g.id).join(",")]);

  // เคลียร์ badge ของห้องที่กำลังเปิดแบบทันทีเมื่อเข้าห้อง
  useEffect(() => {
    if (!cid || !meUidState) return;
    setUnreadMap((prev) => ({ ...prev, [cid]: 0 }));
  }, [cid, meUidState]);

  const convIdWith = (otherUid: string) => [meUidState!, otherUid].sort().join("_");

  /* ========================================================================================= */

  /* ===== render ===== */
  return (
    <main ref={mainRef} className="p-6">
      {/* container กลาง = กว้างเท่ากับ header */}
      <div ref={containerRef} className="mx-auto w-full max-w-4xl px-4">
        {/* กล่องแชทกว้างเต็ม container */}
        <div className="min-w-0 w-full">
          <div className="border rounded-lg h-[65vh] overflow-y-auto p-4 bg-white" ref={dropRef}>
            {(() => {
              let lastDate = "";
              const STACK_MS = 5 * 60 * 1000;

              return groups.map((g, idx) => {
                const uidForName = getSenderUid(g);
                const createdAt = getCreatedAt(g);
                const mine = g.kind === "text" ? g.mine : g.mine;

                const label = fmtDate(createdAt);
                const showSep = !!label && label !== lastDate;
                if (showSep) lastDate = label;

                const t = groupTimes[idx];
                const prevUid = idx > 0 ? getSenderUid(groups[idx - 1]) : null;
                const prevT = idx > 0 ? groupTimes[idx - 1] : 0;
                const isStack = prevUid === uidForName && t - prevT <= STACK_MS;

                const nextUid = idx < groups.length - 1 ? getSenderUid(groups[idx + 1]) : null;
                const nextT = idx < groups.length - 1 ? groupTimes[idx + 1] : Infinity;
                const isEndOfStack = !(nextUid === uidForName && nextT - t <= STACK_MS);

                const who = usersMap[uidForName] || {};
                const nameFrom = who.displayName || who.username || who.email || "ผู้ใช้";

                // reader avatars (GROUP)
                const readers: string[] = [];
                if (isGroup && isEndOfStack) {
                  for (const [uid, seenIdx] of Object.entries(lastSeenIndexByUser)) {
                    if (uid !== myUid && seenIdx === idx) readers.push(uid);
                  }
                }

                return (
                  <div key={idx}>
                    {showSep && (
                      <div className="text-center my-3">
                        <span className="text-xs text-slate-500 bg-slate-200 px-3 py-1 rounded-full">{label}</span>
                      </div>
                    )}

                    <div className={`mb-3 flex ${mine ? "justify-end" : "justify-start"}`}>
                      {!mine && (isStack ? (
                        <div className="w-7 mr-2" />
                      ) : (
                        <img
                          src={who.photoURL || undefined}
                          className="w-7 h-7 rounded-full object-cover border mr-2 self-start"
                          alt=""
                        />
                      ))}

                      <div className={`flex flex-col ${mine ? "items-end" : "items-start"} max-w-[80%]`}>
                        {!mine && !isStack && <p className="text-xs text-slate-500 mb-1">{nameFrom}</p>}

                        {g.kind === "text" ? (
                          <div className={`${mine ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-900"} px-3 py-2 rounded-2xl`}>
                            {/* ทำลิงก์ให้กดได้ */}
                            <div className="whitespace-pre-wrap break-words">
                              {renderWithLinks((g as any).msg.text)}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <ImageGridBubble
                              mine={mine}
                              items={(g as any).items.map((it: any) => ({ id: it.id, url: it.imageURL, name: it.imageName } as ImageItem))}
                              onOpenAt={(start) => {
                                setViewerItems((g as any).items.map((it: any) => ({ url: it.imageURL, name: it.imageName })));
                                setViewerIndex(start);
                                setViewerOpen(true);
                              }}
                            />
                          </div>
                        )}

                        {isEndOfStack && (
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[10px] text-slate-500">
                              {fmtTime(createdAt)} {mine && !isGroup ? (isReadByOther(createdAt) ? "อ่านแล้ว" : "✓") : ""}
                            </span>

                            {isGroup && readers.length > 0 && (
                              <div className="flex -space-x-1">
                                {readers.map((uid) => {
                                  const u = usersMap[uid] || {};
                                  return (
                                    <img
                                      key={uid}
                                      src={u.photoURL || undefined}
                                      className="w-4 h-4 rounded-full border object-cover"
                                      title={u.displayName || u.username || u.email || uid}
                                      alt=""
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
            <div ref={bottomRef} />
          </div>

          {/* พรีวิวรูปที่รอส่ง */}
          {pendingImages.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">{pendingImages.length} รูปที่รอส่ง</span>
                <button className="text-xs text-slate-500 underline" onClick={clearPending} disabled={uploading}>
                  ลบทั้งหมด
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {pendingImages.map((p) => (
                  <div key={p.id} className="relative">
                    <img src={p.previewURL} className="w-full h-28 object-cover rounded-lg border bg-white" alt="" />
                    <button
                      type="button"
                      onClick={() => removePending(p.id)}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-600 text-white text-xs"
                      disabled={uploading}
                      title="ลบรูปนี้"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* แถวอินพุต */}
          <div className="relative flex mt-4 items-end gap-2">
            <input
              id="image-input"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const fs = e.target.files;
                if (fs?.length) addFilesToPreview(fs);
                e.currentTarget.value = "";
              }}
            />
            <label htmlFor="image-input" className="border rounded-lg px-3 py-2 bg-white hover:bg-slate-50 cursor-pointer" title="เลือกรูป">
              📷
            </label>

            <textarea
              ref={inputRef}
              className="flex-1 border px-3 py-2 rounded-lg outline-none resize-none max-h-40"
              rows={1}
              value={text}
              placeholder="พิมพ์ข้อความ…"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                const isComposing = (e.nativeEvent as any).isComposing || (e.nativeEvent as KeyboardEvent).keyCode === 229;
                if (e.key === "Enter" && !e.shiftKey && !isComposing) {
                  e.preventDefault();
                  if (text.trim() || pendingImages.length) sendAll();
                }
              }}
              disabled={uploading}
            />

            <button
              type="button"
              onClick={() => setShowPicker((s) => !s)}
              className="border rounded-lg px-3 py-2 bg-white hover:bg-slate-50"
              disabled={uploading}
              title="อีโมจิ"
            >
              😊
            </button>

            <button
              onClick={sendAll}
              disabled={uploading || (!text.trim() && pendingImages.length === 0)}
              className={`px-4 py-2 rounded-lg text-white ${
                text.trim() || pendingImages.length ? "bg-blue-600 hover:bg-blue-700" : "bg-blue-300 cursor-not-allowed"
              }`}
            >
              ส่ง
            </button>

            {uploading && <div className="absolute -top-6 left-0 text-xs text-slate-500">กำลังส่ง… {progress}%</div>}

            {showPicker && (
              <div ref={pickerRef} className="absolute bottom-14 right-0 z-50 shadow-lg bg-white rounded-xl">
                <EmojiPicker
                  data={data}
                  locale="th"
                  theme="light"
                  previewPosition="none"
                  searchPosition="none"
                  navPosition="bottom"
                  onEmojiSelect={(emoji: any) => {
                    setText((t) => `${t}${emoji.native}`);
                    setShowPicker(false);
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Overlay: ChatRightPanel ทางขวา นอก container ===== */}
      {panelRightLeft !== null && (
        <div
          className="hidden lg:block"
          style={{
            position: "fixed",
            left: panelRightLeft,
            top: stickyTop,
            width: PANEL_RIGHT_W,
            maxHeight: `calc(100vh - ${stickyTop}px)`,
            overflowY: "auto",
            zIndex: 30,
          }}
        >
          <ChatRightPanel
            cid={cid}
            isGroup={!!isGroup}
            meUid={myUid}
            participants={participants}
            usersMap={usersMap}
            groupName={conv?.name}
            groupPhoto={conv?.photoURL}
            canEditGroup={isGroup && !!(myUid && participants.includes(myUid))}
            media={media}
            links={links}
            onLeave={handleLeave}
            onChangeGroupPhoto={handleChangeGroupPhoto}
            onRenameGroup={handleRenameGroup}
            stickyTop={0} // ภายใน panel ไม่ต้อง sticky ซ้ำ เพราะ wrapper fixed แล้ว
          />
        </div>
      )}

      {/* ===== Overlay: Left panel (โปรไฟล์เรา + รายชื่อเพื่อน + กลุ่ม) ===== */}
      {panelLeftLeft !== null && (
        <aside
          className="hidden lg:block"
          style={{
            position: "fixed",
            left: panelLeftLeft,
            top: stickyTop,
            width: PANEL_LEFT_W,
            maxHeight: `calc(100vh - ${stickyTop}px)`,
            overflowY: "auto",
            zIndex: 20,
          }}
        >
          {/* Profile card */}
          <div className="border rounded-xl p-3 bg-white mb-4">
            <div className="flex items-center gap-3">
              {meDoc?.photoURL ? (
                <img src={meDoc.photoURL} alt={meDoc.displayName || meDoc.username || meDoc.email || "me"} className="w-12 h-12 rounded-full object-cover border" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium text-white">🙂</div>
              )}
              <div className="min-w-0">
                <div className="font-medium truncate">{meDoc?.displayName || "(ไม่มีชื่อที่แสดง)"}</div>
                <div className="text-xs text-slate-500 truncate">{meDoc?.username ? `@${meDoc.username}` : meDoc?.email}</div>
              </div>
              <Link
                href="/profile"
                className="ml-auto shrink-0 px-3 py-1.5 rounded-lg border hover:bg-slate-50 text-sm"
                title="จัดการโปรไฟล์"
              >
                จัดการโปรไฟล์
              </Link>
            </div>
          </div>

          {/* Friends */}
          <section className="border rounded-xl bg-white mb-4">
            <div className="flex items-center px-3 h-10 border-b rounded-t-xl">
              <div className="font-medium">เพื่อน</div>
              <Link href="/friends" className="ml-auto text-xs text-slate-500 hover:underline">
                จัดการเพื่อน
              </Link>
            </div>

            <ul className="p-2">
              {friendUsers.map((u) => {
                const theCid = convIdWith(u.uid);
                const unread = unreadMap[theCid] || 0;
                return (
                  <li key={u.uid}>
                    <Link
                      href={`/chat/${theCid}`}
                      className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50"
                    >
                      {u.photoURL ? (
                        <img src={u.photoURL} className="w-8 h-8 rounded-full object-cover border" alt="" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-white">
                          {(u.displayName?.[0] || u.username?.[0] || u.email?.[0] || "👤").toString().toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm truncate">{u.displayName || "(ไม่มีชื่อที่แสดง)"}</div>
                        <div className="text-[11px] text-slate-500 truncate">{u.username ? `@${u.username}` : u.email}</div>
                      </div>
                      {unread > 0 && (
                        <span className="ml-auto text-[10px] bg-red-600 text-white rounded-full px-[6px] py-[1px] leading-5 min-w-[20px] text-center">
                          {unread}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
              {friendUsers.length === 0 && (
                <li className="px-3 py-2 text-xs text-slate-500">ยังไม่มีเพื่อน – ไปเพิ่มเพื่อนได้ที่หน้า “จัดการเพื่อน”</li>
              )}
            </ul>
          </section>

          {/* Groups */}
          <section className="border rounded-xl bg-white">
            <div className="flex items-center px-3 h-10 border-b rounded-t-xl">
              <div className="font-medium">กลุ่ม</div>
              <Link href="/groups/new" className="ml-auto text-xs text-slate-500 hover:underline">
                สร้างกลุ่ม
              </Link>
            </div>

            <ul className="p-2">
              {groupsList.map((g) => {
                const unread = unreadMap[g.id] || 0;
                return (
                  <li key={g.id}>
                    <Link
                      href={`/chat/${g.id}`}
                      className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50"
                    >
                      {g.photoURL ? (
                        <img src={g.photoURL} className="w-8 h-8 rounded-full object-cover border" alt="" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-white">
                          {(g.name?.[0] || "G").toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm truncate">{g.name || "(ไม่มีชื่อกลุ่ม)"}</div>
                        <div className="text-[11px] text-slate-500 truncate">สมาชิก {g.participants?.length || 0} คน</div>
                      </div>
                      {unread > 0 && (
                        <span className="ml-auto text-[10px] bg-red-600 text-white rounded-full px-[6px] py-[1px] leading-5 min-w-[20px] text-center">
                          {unread}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
              {groupsList.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">ยังไม่มีกลุ่ม</li>}
            </ul>
          </section>
        </aside>
      )}

      {/* Lightbox ของรูปในแชท */}
      <Lightbox open={viewerOpen} items={viewerItems} index={viewerIndex} onClose={() => setViewerOpen(false)} onIndexChange={setViewerIndex} />
    </main>
  );
}
