"use client";
import { useFormStatus } from "react-dom";
import { useEffect, useRef } from "react";
export function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button className="w-full mt-6" disabled={pending}>
      {pending ? "Please wait…" : children}
    </button>
  );
}
export function RequestId() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let value = sessionStorage.getItem("alvis-onboarding-request");
    if (!value) {
      value = crypto.randomUUID();
      sessionStorage.setItem("alvis-onboarding-request", value);
    }
    if (input.current) input.current.value = value;
  }, []);
  return <input ref={input} type="hidden" name="request_id" />;
}
