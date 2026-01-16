// src/components/CallPanel.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import {
  CallDoc,
  ensureCallRoom,
  isMemberActive,
  pickOffererUid,
} from "@/lib/call-room";
import {
  RTC_CONFIG,
  getMicStream,
  hasRemoteAnswer,
  safeClosePC,
  stopStream,
} from "@/lib/webrtc";

type Props = {
  open: boolean;
  onClose: () => void;
  cid: string;
  meUid: string | null;
  otherUid: string | null; // DM เท่านั้น
  usersMap?: Record<string, { displayName?: string; username?: string; email?: string; photoURL?: string }>;
};

type CandidateDoc = {
  seq: number;
  fromUid: string;
  toUid: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  createdAt?: any;
};

export default function CallPanel({ open, onClose, cid, meUid, otherUid, usersMap = {} }: Props) {
  const canUse = !!open && !!cid && !!meUid && !!otherUid;

  const [call, setCall] = useState<CallDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [statusText, setStatusText] = useState<string>("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const seq = call?.seq ?? 0;

  const otherLabel = useMemo(() => {
    if (!otherUid) return "อีกฝ่าย";
    const u = usersMap[otherUid] || {};
    return u.displayName || (u.username ? `@${u.username}` : "") || u.email || "อีกฝ่าย";
  }, [otherUid, usersMap]);

  const offererUid = useMemo(() => {
    if (!meUid || !otherUid) return null;
    return pickOffererUid(meUid, otherUid);
  }, [meUid, otherUid]);

  const iAmOfferer = !!meUid && !!offererUid && meUid === offererUid;

  const myActive = useMemo(() => {
    if (!meUid || !call?.members) return false;
    return isMemberActive(call.members[meUid]);
  }, [meUid, call?.members]);

  const otherActive = useMemo(() => {
    if (!otherUid || !call?.members) return false;
    return isMemberActive(call.members[otherUid]);
  }, [otherUid, call?.members]);

  const ringingToMe = useMemo(() => {
    if (!meUid || !otherUid || !call?.ring) return false;
    return call.ring.toUid === meUid && call.ring.fromUid === otherUid && call.ring.seq === call.seq;
  }, [call?.ring, call?.seq, meUid, otherUid]);

  const ringingFromMe = useMemo(() => {
    if (!meUid || !otherUid || !call?.ring) return false;
    return call.ring.fromUid === meUid && call.ring.toUid === otherUid && call.ring.seq === call.seq;
  }, [call?.ring, call?.seq, meUid, otherUid]);

  const candidatesCol = () => collection(db, "conversations", cid, "calls", "main", "candidates");

  // subscribe call doc when open
  useEffect(() => {
    if (!open || !cid) return;

    let off: (() => void) | null = null;

    (async () => {
      const ref = await ensureCallRoom(cid);
      off = onSnapshot(ref, (snap) => {
        if (!snap.exists()) return;
        setCall({ ...(snap.data() as any) } as CallDoc);
      });
    })();

    return () => {
      if (off) off();
      setCall(null);
      setStatusText("");
    };
  }, [open, cid]);

  // cleanup pc when panel closed? -> ไม่ทำ (เพราะต้องการอยู่ในสายต่อได้)
  // ถ้าจะทำให้ “ปิดแผง” แล้วอยู่สายต่อ: ต้องไม่ hardHangup
  useEffect(() => {
    if (open) return;
    setStatusText("");
  }, [open]);

  const setMyMember = async (patch: any) => {
    if (!meUid) return;
    const callRef = doc(db, "conversations", cid, "calls", "main");
    await setDoc(
      callRef,
      {
        updatedAt: serverTimestamp(),
        [`members.${meUid}`]: patch,
      },
      { merge: true }
    );
  };

  const createPC = async (currentSeq: number) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    const local = await getMicStream();
    localStreamRef.current = local;
    local.getTracks().forEach((t) => pc.addTrack(t, local));

    pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    pc.onicecandidate = async (ev) => {
      if (!ev.candidate || !meUid || !otherUid) return;
      const c = ev.candidate;
      const payload: CandidateDoc = {
        seq: currentSeq,
        fromUid: meUid,
        toUid: otherUid,
        candidate: c.candidate,
        sdpMid: c.sdpMid,
        sdpMLineIndex: c.sdpMLineIndex,
        createdAt: serverTimestamp(),
      };
      await addDoc(candidatesCol(), payload);
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") setStatusText("เชื่อมต่อแล้ว");
      else if (st === "connecting") setStatusText("กำลังเชื่อมต่อ…");
      else if (st === "disconnected") setStatusText("หลุดการเชื่อมต่อ");
      else if (st === "failed") setStatusText("เชื่อมต่อไม่สำเร็จ");
      else if (st === "closed") setStatusText("ปิดสายแล้ว");
    };

    const qCand = query(
      candidatesCol(),
      where("toUid", "==", meUid),
      where("seq", "==", currentSeq),
      orderBy("createdAt", "asc")
    );

    const offCand = onSnapshot(qCand, (snap) => {
      snap.docChanges().forEach(async (ch) => {
        if (ch.type !== "added") return;
        const d = ch.doc.data() as any as CandidateDoc;
        try {
          await pc.addIceCandidate({
            candidate: d.candidate,
            sdpMid: d.sdpMid,
            sdpMLineIndex: d.sdpMLineIndex ?? undefined,
          } as any);
        } catch {}
      });
    });

    return { pc, offCand };
  };

  const hardCloseLocal = () => {
    const pc = pcRef.current as any;
    if (pc?.__offCand) {
      try {
        pc.__offCand();
      } catch {}
    }
    safeClosePC(pcRef.current);
    pcRef.current = null;

    stopStream(localStreamRef.current);
    localStreamRef.current = null;

    if (remoteAudioRef.current) {
      try {
        remoteAudioRef.current.srcObject = null;
      } catch {}
    }

    setMuted(false);
    setStatusText("");
  };

  const bumpSeqAndClearSignal = async (callRef: any, nextSeq: number) => {
    await setDoc(
      callRef,
      {
        status: "active",
        seq: nextSeq,
        updatedAt: serverTimestamp(),
        offer: null,
        answer: null,
        ring: null,
        reofferRequest: null,
      },
      { merge: true }
    );
  };

  const joinRoom = async () => {
    if (!canUse || busy || !meUid) return;
    setBusy(true);
    try {
      const callRef = await ensureCallRoom(cid);

      await setDoc(
        callRef,
        {
          updatedAt: serverTimestamp(),
          status: "active",
          [`members.${meUid}`]: { joinedAt: serverTimestamp(), leftAt: null, muted: false },
        },
        { merge: true }
      );

      // ถ้าเราเป็น offerer -> bump seq แล้วสร้าง offer
      // ถ้าเราเป็น answerer -> ขอ offer ใหม่ผ่าน reofferRequest แล้วรอ
      const snap = await getDoc(callRef);
      const cur = (snap.data() as any as CallDoc) || { seq: 0 };
      const nextSeq = (cur.seq || 0) + 1;

      if (iAmOfferer) {
        await bumpSeqAndClearSignal(callRef, nextSeq);

        const { pc, offCand } = await createPC(nextSeq);
        (pc as any).__offCand = offCand;

        setStatusText("กำลังสร้างสาย…");
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);

        await setDoc(
          callRef,
          {
            updatedAt: serverTimestamp(),
            offer: { type: "offer", sdp: offer.sdp || "", uid: meUid, seq: nextSeq },
          },
          { merge: true }
        );

        setStatusText("รออีกฝ่ายเข้าร่วม…");
      } else {
        // ขอให้ offerer สร้าง offer ใหม่
        await setDoc(
          callRef,
          {
            updatedAt: serverTimestamp(),
            reofferRequest: { uid: meUid, at: serverTimestamp(), seq: nextSeq },
          },
          { merge: true }
        );
        setStatusText("กำลังขอเชื่อมต่อใหม่…");
      }
    } finally {
      setBusy(false);
    }
  };

  const startRinging = async () => {
    if (!canUse || busy || !meUid || !otherUid) return;
    setBusy(true);
    try {
      const callRef = await ensureCallRoom(cid);

      // ถ้าห้องว่าง -> ringing + join
      const snap = await getDoc(callRef);
      const cur = (snap.data() as any as CallDoc) || { seq: 0 };
      const nextSeq = (cur.seq || 0) + 1;

      await bumpSeqAndClearSignal(callRef, nextSeq);

      await setDoc(
        callRef,
        {
          updatedAt: serverTimestamp(),
          status: "ringing",
          ring: { fromUid: meUid, toUid: otherUid, at: serverTimestamp(), seq: nextSeq },
          [`members.${meUid}`]: { joinedAt: serverTimestamp(), leftAt: null, muted: false },
        },
        { merge: true }
      );

      // ให้ offerer เริ่ม offer ทันที (เพื่อให้รับสายแล้วต่อได้เลย)
      if (iAmOfferer) {
        const { pc, offCand } = await createPC(nextSeq);
        (pc as any).__offCand = offCand;

        setStatusText("กำลังสร้างสาย…");
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);

        await setDoc(
          callRef,
          {
            updatedAt: serverTimestamp(),
            offer: { type: "offer", sdp: offer.sdp || "", uid: meUid, seq: nextSeq },
          },
          { merge: true }
        );

        setStatusText("รออีกฝ่ายรับ/เข้าร่วม…");
      } else {
        // answerer เริ่มโทรได้ แต่ให้ขอ offerer ผ่าน reofferRequest (กันมั่ว)
        await setDoc(
          callRef,
          {
            updatedAt: serverTimestamp(),
            reofferRequest: { uid: meUid, at: serverTimestamp(), seq: nextSeq },
          },
          { merge: true }
        );
        setStatusText("กำลังเรียก…");
      }
    } finally {
      setBusy(false);
    }
  };

  const acceptIncoming = async () => {
    // “รับสาย” = joinRoom (เพราะมันเป็นห้อง)
    await joinRoom();
  };

  // offerer: ถ้ามี reofferRequest จากอีกฝั่ง -> bump seq + ทำ offer ใหม่
  useEffect(() => {
    if (!open || !call || !meUid || !otherUid) return;
    if (!iAmOfferer) return;

    const req = call.reofferRequest;
    if (!req) return;
    if (req.uid !== otherUid) return; // ขอจากอีกฝ่ายเท่านั้น

    // กันทำซ้ำ
    if (busy) return;

    (async () => {
      setBusy(true);
      try {
        const callRef = doc(db, "conversations", cid, "calls", "main");

        // ปิดของเก่าแล้วสร้างใหม่
        hardCloseLocal();

        const snap = await getDoc(callRef);
        const cur = (snap.data() as any as CallDoc) || { seq: 0 };
        const nextSeq = Math.max((cur.seq || 0) + 1, req.seq); // กันเลขย้อน

        await bumpSeqAndClearSignal(callRef, nextSeq);

        const { pc, offCand } = await createPC(nextSeq);
        (pc as any).__offCand = offCand;

        setStatusText("กำลังสร้างสาย…");
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);

        await setDoc(
          callRef,
          {
            updatedAt: serverTimestamp(),
            offer: { type: "offer", sdp: offer.sdp || "", uid: meUid, seq: nextSeq },
          },
          { merge: true }
        );

        setStatusText("รออีกฝ่ายเข้าร่วม…");
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.reofferRequest?.uid, call?.reofferRequest?.seq, open]);

  // answerer: ถ้าเห็น offer seq ใหม่ -> สร้าง PC ถ้ายังไม่มี แล้วตอบกลับ
  useEffect(() => {
    if (!open || !call || !meUid || !otherUid) return;
    if (iAmOfferer) return;

    const offer = call.offer;
    if (!offer) return;
    if (offer.uid !== otherUid) return; // offer ต้องมาจาก offerer
    if (offer.seq !== call.seq) return;

    // ถ้าเรายังไม่มี pc หรือ pc ปิดไปแล้ว -> สร้างใหม่
    if (!pcRef.current) {
      (async () => {
        setBusy(true);
        try {
          const { pc, offCand } = await createPC(call.seq);
          (pc as any).__offCand = offCand;

          setStatusText("กำลังเชื่อมต่อ…");

          await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          const callRef = doc(db, "conversations", cid, "calls", "main");
          await setDoc(
            callRef,
            {
              updatedAt: serverTimestamp(),
              status: "active",
              ring: null,
              answer: { type: "answer", sdp: answer.sdp || "", uid: meUid, seq: call.seq },
              [`members.${meUid}`]: { joinedAt: serverTimestamp(), leftAt: null, muted: false },
              reofferRequest: null,
            },
            { merge: true }
          );
        } catch {
          setStatusText("เชื่อมต่อไม่สำเร็จ");
        } finally {
          setBusy(false);
        }
      })();
    }
  }, [open, call?.offer?.sdp, call?.seq, meUid, otherUid, iAmOfferer]);

  // offerer: ถ้า answer มา -> setRemote(answer)
  useEffect(() => {
    if (!open || !call || !meUid || !otherUid) return;
    if (!iAmOfferer) return;
    const pc = pcRef.current;
    if (!pc) return;

    const answer = call.answer;
    if (!answer) return;
    if (answer.uid !== otherUid) return;
    if (answer.seq !== call.seq) return;

    (async () => {
      try {
        if (hasRemoteAnswer(pc)) return;
        await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
        setStatusText("เชื่อมต่อแล้ว");
      } catch {}
    })();
  }, [open, call?.answer?.sdp, call?.seq, meUid, otherUid, iAmOfferer]);

  const toggleMute = async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
    await setMyMember({ joinedAt: serverTimestamp(), leftAt: null, muted: next });
  };

  const leaveRoom = async () => {
    if (!meUid) return;

    // ปิด local pc แต่ “ไม่ไปยุ่ง offer/answer ของห้อง”
    hardCloseLocal();

    const callRef = doc(db, "conversations", cid, "calls", "main");

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(callRef);
      if (!snap.exists()) return;
      const d = snap.data() as any as CallDoc;
      const members = d.members || {};
      const patch: any = {
        updatedAt: serverTimestamp(),
        [`members.${meUid}.leftAt`]: serverTimestamp(),
      };

      // ถ้าห้อง “ไม่มีใคร active แล้ว” -> reset ห้องเป็น idle (ล้าง ring/offer/answer เพื่อกันค้าง incoming)
      const afterMembers = { ...members };
      afterMembers[meUid] = { ...(afterMembers[meUid] || {}), leftAt: new Date() as any }; // แค่ใช้เช็คคร่าว ๆ
      const activeUids = Object.entries(members)
        .filter(([uid, m]) => uid !== meUid && isMemberActive(m as any))
        .map(([uid]) => uid);

      if (activeUids.length === 0) {
        patch.status = "idle";
        patch.ring = null;
        patch.offer = null;
        patch.answer = null;
        patch.reofferRequest = null;
      }

      tx.set(callRef, patch, { merge: true });
    });

    setMuted(false);
    setStatusText("");
  };

  const closePanelOnly = () => {
    // ปิดแผง = ซ่อน UI อย่างเดียว ยังอยู่ในห้องได้
    onClose();
  };

  if (!open) return null;

  const showIncomingBar = ringingToMe && !myActive; // มีสายเข้า และเรายังไม่เข้าห้อง
  const showJoin = (call?.status === "active" || call?.status === "ringing") && !myActive && otherActive;

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/40" onClick={closePanelOnly} />
      <div className="absolute inset-x-0 bottom-0 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[420px] bg-white rounded-t-2xl sm:rounded-2xl border shadow-lg overflow-hidden">
        <div className="p-4 border-b flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">📞</div>
          <div className="min-w-0">
            <div className="font-semibold truncate">โทรกับ {otherLabel}</div>
            <div className="text-xs text-slate-500">
              {statusText ||
                (showIncomingBar ? "มีสายเข้า" : myActive ? "คุณอยู่ในสาย" : otherActive ? "อีกฝ่ายอยู่ในสาย" : "พร้อมโทร")}
            </div>
          </div>
          <button
            className="ml-auto px-3 py-1.5 rounded-lg border hover:bg-slate-50"
            onClick={closePanelOnly}
            title="ปิดหน้าต่าง (ยังอยู่ในสายได้)"
          >
            ปิด
          </button>
        </div>

        <div className="p-4 space-y-3">
          {!otherUid ? (
            <div className="text-sm text-rose-600">เวอร์ชันนี้รองรับเฉพาะแชทส่วนตัว (DM) 2 คนก่อน</div>
          ) : null}

          <div className="text-xs text-slate-500">
            หมายเหตุ: ถ้าบางเครือข่ายต่อไม่ได้ อาจต้องเพิ่ม TURN (ค่อยทำทีหลังได้)
          </div>

          {showIncomingBar ? (
            <div className="flex gap-2">
              <button
                onClick={acceptIncoming}
                disabled={busy}
                className="flex-1 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                รับสาย
              </button>
              <button onClick={closePanelOnly} className="flex-1 py-2 rounded-lg border hover:bg-slate-50">
                ยังไม่รับ
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              {!myActive ? (
                <>
                  {showJoin ? (
                    <button
                      onClick={joinRoom}
                      disabled={busy || !canUse}
                      className="flex-1 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      เข้าร่วมสาย
                    </button>
                  ) : (
                    <button
                      onClick={startRinging}
                      disabled={busy || !canUse}
                      className="flex-1 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      เริ่มโทร
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={closePanelOnly}
                  className="flex-1 py-2 rounded-lg border hover:bg-slate-50"
                  title="ซ่อนหน้าต่าง (ยังอยู่ในสาย)"
                >
                  ซ่อนหน้าต่าง
                </button>
              )}

              <button
                onClick={toggleMute}
                disabled={!pcRef.current}
                className="px-4 py-2 rounded-lg border hover:bg-slate-50 disabled:opacity-50"
                title="ปิด/เปิดไมค์"
              >
                {muted ? "🔇" : "🎤"}
              </button>

              <button
                onClick={leaveRoom}
                disabled={!myActive && !pcRef.current}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                title="ออกจากสาย (แต่อีกฝ่ายไม่หลุด)"
              >
                ออก
              </button>
            </div>
          )}

          {/* audio element สำหรับเสียงอีกฝั่ง */}
          <audio ref={remoteAudioRef} autoPlay />
        </div>
      </div>
    </div>
  );
}
