import * as React from "react"
import { cn } from "cn"
import { FieldMenu } from "@/components/EditMenu"
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu"

function Input({ className, type, ref, ...props }: React.ComponentProps<"input">) {
  const field = React.useRef<HTMLInputElement>(null)
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <input
          ref={(node) => {
            field.current = node
            if (typeof ref === "function") ref(node)
            else if (ref) ref.current = node
          }}
          type={type}
          data-slot="input"
          className={cn(
            "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
            className
          )}
          {...props}
        />
      </ContextMenuTrigger>
      <FieldMenu field={field} />
    </ContextMenu>
  )
}

export { Input }
