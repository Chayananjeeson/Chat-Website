// src/lib/webrtc.ts
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export async function getMicStream() {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
}

export function stopStream(stream?: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {}
  });
}

export function safeClosePC(pc?: RTCPeerConnection | null) {
  if (!pc) return;
  try {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
  } catch {}
}

/** กัน setRemote ซ้ำ ๆ */
export function hasRemoteAnswer(pc?: RTCPeerConnection | null) {
  const cur = pc?.currentRemoteDescription;
  return !!cur && cur.type === "answer";
}
