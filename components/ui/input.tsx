import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn("input input-bordered w-full bg-white shadow-none", className)}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
