import { InputHTMLAttributes, forwardRef, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded border border-border bg-background px-3 text-sm placeholder:text-muted-foreground transition-all duration-200 ease-smooth focus:outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/15 disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex w-full rounded border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground transition-all duration-200 ease-smooth resize-none focus:outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/15 disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("text-sm font-medium mb-1.5 block", className)} {...props} />
);
