import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn("textarea textarea-bordered w-full bg-white shadow-none", className)}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export { Textarea };
