import * as React from "react"
import { cn } from "cn"
import { FieldMenu } from "@/components/EditMenu"
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu"

function Textarea({ className, ref, ...props }: React.ComponentProps<"textarea">) {
  const field = React.useRef<HTMLTextAreaElement>(null)
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <textarea
          ref={(node) => {
            field.current = node
            if (typeof ref === "function") ref(node)
            else if (ref) ref.current = node
          }}
          data-slot="textarea"
          className={cn(
            "min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
            className
          )}
          {...props}
        />
      </ContextMenuTrigger>
      <FieldMenu field={field} />
    </ContextMenu>
  )
}

export { Textarea }
