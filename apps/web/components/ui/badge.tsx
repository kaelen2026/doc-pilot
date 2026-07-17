import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs tabular-nums [&>svg]:size-3 [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        // 中性状态胶囊：纸凹底、软墨字，沿用原文档列表的状态标
        default: "bg-secondary text-secondary-foreground",
        outline: "border border-hairline text-ink-soft",
        destructive: "bg-transparent px-0 text-destructive",
        seal: "bg-seal/10 text-seal-deep",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
