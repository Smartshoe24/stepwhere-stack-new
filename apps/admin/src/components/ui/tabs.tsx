import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

type TabsVariant = 'segmented' | 'line'
const TabsVariantContext = React.createContext<TabsVariant>('segmented')

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot='tabs'
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  )
}

/**
 * `segmented` (default): inset pill group for small toggles such as time ranges.
 * `line`: section tabs with a pink underline on the active tab (detail pages).
 */
function TabsList({
  className,
  variant = 'segmented',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
  variant?: TabsVariant
}) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.List
        data-slot='tabs-list'
        data-variant={variant}
        className={cn(
          variant === 'line'
            ? 'no-scrollbar flex w-full items-center gap-5 overflow-x-auto border-b border-line-faint'
            : 'inline-flex h-8 w-fit items-center justify-center gap-0.5 rounded-md bg-inset p-0.5 text-ink-3 shadow-[inset_0_0_0_1px_var(--line)]',
          className
        )}
        {...props}
      />
    </TabsVariantContext.Provider>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(TabsVariantContext)
  return (
    <TabsPrimitive.Trigger
      data-slot='tabs-trigger'
      className={cn(
        "focus-trail inline-flex items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        variant === 'line'
          ? "relative h-9 shrink-0 rounded-xs px-0 text-ink-3 hover:text-ink data-[state=active]:text-ink data-[state=active]:before:absolute data-[state=active]:before:inset-x-0 data-[state=active]:before:-bottom-px data-[state=active]:before:h-0.5 data-[state=active]:before:rounded-t-xs data-[state=active]:before:bg-toggle data-[state=active]:before:content-['']"
          : 'h-7 flex-1 rounded-xs px-2.5 text-xs text-ink-3 hover:text-ink data-[state=active]:bg-overlay data-[state=active]:text-ink data-[state=active]:shadow-[inset_0_0_0_1px_var(--line)]',
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot='tabs-content'
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
