import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** shadcn-style primitives for the MVP, tuned to the Tracktist look (brief §12). */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-accent-grad text-white shadow-glow hover:shadow-glow-lg hover:brightness-110",
        ghost: "text-white/75 hover:bg-white/5 hover:text-white",
        outline: "border border-white/12 text-white hover:border-white/25 hover:bg-white/5",
        subtle: "bg-white/[0.06] text-white hover:bg-white/10",
        danger: "bg-red-500/90 text-white hover:bg-red-500",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card p-4", className)} {...props} />;
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-white/[0.07] text-white/65 ring-1 ring-inset ring-white/5",
    accent: "bg-accent/15 text-accent-soft ring-1 ring-inset ring-accent/25",
    success: "bg-glow/10 text-glow ring-1 ring-inset ring-glow/25",
    warning: "bg-amber-500/12 text-amber-300 ring-1 ring-inset ring-amber-500/25",
    danger: "bg-red-500/12 text-red-300 ring-1 ring-inset ring-red-500/25",
  };
  return <span className={cn("pill", tones[tone], className)} {...props} />;
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn("input", className)} {...props} />
  ),
);
Input.displayName = "Input";

export function SectionTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2.5 text-lg font-semibold text-white">
        <span className="h-4 w-1 rounded-full bg-accent-grad" />
        {children}
      </h2>
      {hint ? <span className="text-xs text-white/40">{hint}</span> : null}
    </div>
  );
}

/** Deterministic gradient avatar from a name — gives every artist an identity. */
export function GradientAvatar({
  name,
  size = 44,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const h1 = hash % 360;
  const h2 = (h1 + 60) % 360;
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-xl font-semibold text-white/95 ring-1 ring-inset ring-white/15",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        backgroundImage: `linear-gradient(135deg, hsl(${h1} 70% 55%), hsl(${h2} 75% 45%))`,
      }}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}
