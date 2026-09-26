import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", {
  variants: {
    tone: {
      neutral: "bg-surface text-muted",
      ube: "bg-ube-light text-ube-dark",
      good: "bg-leaf/10 text-leaf",
      warn: "bg-amber/10 text-amber",
      bad: "bg-danger/10 text-danger",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
