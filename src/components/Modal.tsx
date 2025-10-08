// src/components/Modal.tsx
"use client";
import { ReactNode, useEffect } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  widthClass?: string; // tailwind width override
};

export default function Modal({ open, onClose, title, children, widthClass }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000]">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* panel */}
      <div className="absolute left-1/2 top-10 -translate-x-1/2 w-[min(100%,1000px)]">
        <div className={`mx-auto ${widthClass ?? "max-w-4xl"} rounded-xl bg-white shadow-xl border`}>
          {title && (
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">{title}</h3>
              <button onClick={onClose} className="px-2 py-1 text-slate-500 hover:text-slate-800">✕</button>
            </div>
          )}
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
