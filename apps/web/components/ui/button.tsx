import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // 禁用态贴合墨水纸感：实心/描边按钮落到 sunken-paper + 淡墨，而非半透明叠加
        default:
          "bg-primary text-primary-foreground shadow-paper-sm hover:bg-primary/85 disabled:bg-paper-sunken disabled:text-ink-faint disabled:shadow-none",
        destructive:
          "bg-destructive text-destructive-foreground shadow-paper-sm hover:bg-destructive/90 disabled:bg-paper-sunken disabled:text-ink-faint disabled:shadow-none",
        outline:
          "border border-input bg-card text-ink-soft shadow-paper-xs hover:border-ink-faint hover:text-ink disabled:bg-paper-sunken disabled:text-ink-faint disabled:shadow-none",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:text-ink-faint",
        ghost: "hover:bg-accent hover:text-accent-foreground disabled:text-ink-faint",
        link: "text-ink-faint underline-offset-4 hover:text-ink hover:underline disabled:no-underline disabled:opacity-60",
      },
      size: {
        default: "h-10 px-5 py-2.5 has-[>svg]:px-4",
        sm: "h-8 rounded-md px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-11 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
