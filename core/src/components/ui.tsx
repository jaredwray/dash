import type { FormEvent, ReactNode } from "react";
import { cn } from "~/lib/cn";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-mist">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm outline-none focus:border-accent/70",
        props.className,
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm outline-none focus:border-accent/70",
        props.className,
      )}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full min-h-20 rounded-xl border border-line bg-ink px-3 py-2.5 text-sm outline-none focus:border-accent/70",
        props.className,
      )}
    />
  );
}

export function DangerButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  return (
    <button
      {...props}
      className={cn(
        "rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200 hover:bg-rose-500/20 disabled:opacity-50",
        props.className,
      )}
    />
  );
}

export function PrimaryButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  return (
    <button
      {...props}
      className={cn(
        "rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-ink hover:bg-accent/90 disabled:opacity-50",
        props.className,
      )}
    />
  );
}

export function GhostButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  return (
    <button
      {...props}
      className={cn(
        "rounded-xl border border-line px-4 py-2.5 text-sm text-paper hover:bg-white/5 disabled:opacity-50",
        props.className,
      )}
    />
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
  onSubmit,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  onSubmit: (event: FormEvent) => void;
  footer: ReactNode;
}) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-3xl border border-line bg-panel p-8 shadow-[0_30px_80px_rgb(0_0_0_/0.35)]"
      >
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.2em] text-accent">Dash</div>
          <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-mist">{subtitle}</p>
        </div>
        <div className="space-y-4">{children}</div>
        <div className="mt-6 text-sm text-mist">{footer}</div>
      </form>
    </div>
  );
}
