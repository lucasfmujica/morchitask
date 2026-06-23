import { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const card = cva("rounded-card border border-border bg-surface", {
  variants: {
    padding: {
      none: "",
      sm: "p-4",
      md: "p-5",
      lg: "p-6",
    },
    elevation: {
      flat: "",
      soft: "shadow-soft",
      raised: "shadow-card",
    },
  },
  defaultVariants: { padding: "md", elevation: "soft" },
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof card> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, padding, elevation, ...props },
  ref,
) {
  return <div ref={ref} className={cn(card({ padding, elevation }), className)} {...props} />;
});
