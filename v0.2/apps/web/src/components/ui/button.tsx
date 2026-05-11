import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Button variants are tuned for the almanac look: solid burnt-sienna for
// primary, walnut outline for secondary, and a quiet "ghost" for tertiary
// row actions like the remove-stay button. The pressed micro-scale comes
// from the global focus ring + active:translate-y to feel like a printed
// stamp rather than a SaaS press.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[transform,background,color] " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
    "disabled:pointer-events-none disabled:opacity-50 active:translate-y-[1px] " +
    "[&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 rounded-sm shadow-[0_1px_0_hsl(var(--foreground)/0.18)]",
        outline:
          "border border-foreground/30 bg-transparent hover:bg-foreground/[0.04] rounded-sm",
        ghost:
          "bg-transparent hover:bg-foreground/[0.05] text-foreground/80 hover:text-foreground rounded-sm",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-sm",
        link: "text-primary underline-offset-4 hover:underline",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-sm",
      },
      size: {
        default: "h-10 px-4 text-sm",
        sm: "h-9 px-3 text-sm",
        lg: "h-12 px-6 text-[0.95rem]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
