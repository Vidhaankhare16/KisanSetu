import type { ReactNode } from "react";

type Tone = "green" | "saffron" | "red" | "blue" | "gray";

const TONES: Record<Tone, string> = {
  green: "bg-primary-soft text-primary-dark",
  saffron: "bg-accent-soft text-accent",
  red: "bg-danger-soft text-danger",
  blue: "bg-info-soft text-info",
  gray: "bg-border/60 text-muted",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {sub && <p className="text-xs text-muted/80">{sub}</p>}
    </div>
  );
}

export function Stat({ label, value, tone = "green" }: { label: string; value: ReactNode; tone?: Tone }) {
  const ring: Record<Tone, string> = {
    green: "text-primary", saffron: "text-accent", red: "text-danger",
    blue: "text-info", gray: "text-foreground",
  };
  return (
    <Card className="p-4">
      <div className={`text-2xl font-bold ${ring[tone]}`}>{value}</div>
      <div className="mt-1 text-xs font-medium text-muted">{label}</div>
    </Card>
  );
}

export function Button({
  children, onClick, variant = "primary", size = "md", disabled, type = "button", className = "",
}: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "accent" | "ghost" | "danger";
  size?: "sm" | "md" | "lg"; disabled?: boolean; type?: "button" | "submit"; className?: string;
}) {
  const variants = {
    primary: "bg-primary text-white hover:bg-primary-dark",
    accent: "bg-accent text-white hover:brightness-95",
    ghost: "bg-transparent text-foreground border border-border hover:bg-border/40",
    danger: "bg-danger text-white hover:brightness-95",
  };
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm", lg: "px-5 py-3 text-base" };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
      {label}
    </span>
  );
}

type TimeAgoT = (key: string, vars?: Record<string, string | number>) => string;

export function timeAgo(ts: number, t: TimeAgoT): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return t("time.now");
  const m = Math.floor(s / 60);
  if (m < 60) return t("time.m", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("time.h", { n: h });
  return t("time.d", { n: Math.floor(h / 24) });
}
