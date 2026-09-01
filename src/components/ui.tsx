"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "danger" }) {
  const styles = {
    default: "border-[var(--border)] hover:bg-[var(--surface)]",
    primary: "border-transparent bg-[var(--accent)] text-white hover:opacity-90",
    danger: "border-[var(--border)] text-[var(--danger)] hover:bg-[var(--surface)]",
  }[variant];

  return (
    <button
      {...props}
      className={`rounded-md border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] ${className}`}
    />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-[var(--danger)]">{children}</p>;
}

export function Spinner() {
  return (
    <span className="inline-block size-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
  );
}
