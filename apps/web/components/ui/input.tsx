import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-ink shadow-paper-xs outline-none transition-[border-color,box-shadow] duration-150",
        "placeholder:text-ink-faint file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "focus:border-ring focus:ring-2 focus:ring-ring/15",
        "disabled:cursor-not-allowed disabled:bg-paper-sunken disabled:text-ink-faint disabled:shadow-none",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
