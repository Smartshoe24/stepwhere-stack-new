import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, LogOut } from 'lucide-react'
import useDialogState from '@/hooks/use-dialog-state'
import { useSearch } from '@/context/search-provider'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { SignOutDialog } from './sign-out-dialog'
import { sidebarData } from './layout/data/sidebar-data'
import { ScrollArea } from './ui/scroll-area'

export function CommandMenu() {
  const navigate = useNavigate()
  const { open, setOpen } = useSearch()
  const [signOutOpen, setSignOutOpen] = useDialogState()

  const runCommand = React.useCallback(
    (command: () => unknown) => {
      setOpen(false)
      command()
    },
    [setOpen]
  )

  return (
    <>
      <CommandDialog modal open={open} onOpenChange={setOpen}>
        <CommandInput placeholder='Jump to a page…' />
        <CommandList>
          <ScrollArea type='hover' className='h-72 pe-1'>
            <CommandEmpty>No results found.</CommandEmpty>
            {sidebarData.navGroups.map((group) => (
              <CommandGroup key={group.title} heading={group.title}>
                {group.items.map((navItem, i) =>
                  navItem.url ? (
                    <CommandItem
                      key={`${navItem.url}-${i}`}
                      value={navItem.title}
                      onSelect={() => {
                        runCommand(() => navigate({ to: navItem.url }))
                      }}
                    >
                      {navItem.icon ? (
                        <navItem.icon className='text-ink-3' />
                      ) : (
                        <ArrowRight className='text-ink-3' />
                      )}
                      {navItem.title}
                    </CommandItem>
                  ) : null
                )}
              </CommandGroup>
            ))}
            <CommandSeparator />
            <CommandGroup heading='Account'>
              <CommandItem
                value='Sign out'
                onSelect={() => runCommand(() => setSignOutOpen(true))}
              >
                <LogOut className='text-ink-3' />
                Sign out
              </CommandItem>
            </CommandGroup>
          </ScrollArea>
        </CommandList>
      </CommandDialog>
      <SignOutDialog open={!!signOutOpen} onOpenChange={setSignOutOpen} />
    </>
  )
}
