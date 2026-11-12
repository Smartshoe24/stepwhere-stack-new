import { type FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  KeyRound,
  Pencil,
  Plus,
  Search as SearchIcon,
  ShieldCheck,
  Trash2,
  UsersRound,
} from 'lucide-react'
import type { PreviewAccessEntryDto } from '@stepwhere/types'
import { toast } from 'sonner'
import { adminQueryKeys } from '@/features/admin/query-keys'
import { PreviewAccessStatusBadge } from '@/features/admin/components/status-badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/patterns/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  createPreviewAccessEntry,
  deletePreviewAccessEntry,
  getPreviewAccessState,
  updatePreviewAccessEntry,
} from '@/lib/api-client'
import { handleServerError } from '@/lib/handle-server-error'

const E164_PATTERN = /^\+[1-9]\d{7,14}$/

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

export function PreviewAccessPage() {
  const queryClient = useQueryClient()
  const [phoneNumber, setPhoneNumber] = useState('')
  const [label, setLabel] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [editingEntry, setEditingEntry] =
    useState<PreviewAccessEntryDto | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [deletingEntry, setDeletingEntry] =
    useState<PreviewAccessEntryDto | null>(null)

  const previewQuery = useQuery({
    queryKey: adminQueryKeys.previewAccess.state(),
    queryFn: getPreviewAccessState,
  })

  const refreshPreviewAccess = () =>
    queryClient.invalidateQueries({
      queryKey: adminQueryKeys.previewAccess.state(),
    })

  const createMutation = useMutation({
    mutationFn: createPreviewAccessEntry,
    onSuccess: async () => {
      setPhoneNumber('')
      setLabel('')
      setFormError(null)
      await refreshPreviewAccess()
      toast.success('Tester added to preview access.')
    },
    onError: (error) => {
      setFormError(
        error instanceof Error ? error.message : 'Unable to add tester.'
      )
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      entryId,
      input,
    }: {
      entryId: string
      input: { label?: string | null; isActive?: boolean }
    }) => updatePreviewAccessEntry(entryId, input),
    onSuccess: async (_, variables) => {
      await refreshPreviewAccess()
      if (variables.input.label !== undefined) {
        setEditingEntry(null)
        toast.success('Tester label updated.')
      }
    },
    onError: handleServerError,
  })

  const deleteMutation = useMutation({
    mutationFn: deletePreviewAccessEntry,
    onSuccess: async () => {
      setDeletingEntry(null)
      await refreshPreviewAccess()
      toast.success('Tester removed from preview access.')
    },
    onError: handleServerError,
  })

  const entries = useMemo(
    () => previewQuery.data?.entries ?? [],
    [previewQuery.data?.entries]
  )
  const activeCount = entries.filter((entry) => entry.isActive).length
  const filteredEntries = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return entries

    return entries.filter(
      (entry) =>
        entry.phoneNumber.toLowerCase().includes(query) ||
        entry.label?.toLowerCase().includes(query)
    )
  }, [entries, filter])

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedPhone = phoneNumber.trim()

    if (!E164_PATTERN.test(normalizedPhone)) {
      setFormError(
        'Enter a valid number in E.164 format, such as +919876543210.'
      )
      return
    }

    createMutation.mutate({
      phoneNumber: normalizedPhone,
      label: label.trim() || null,
    })
  }

  function openEdit(entry: PreviewAccessEntryDto) {
    setEditingEntry(entry)
    setEditLabel(entry.label ?? '')
  }

  return (
    <>
      <Main>
        <PageHeader
          title='Preview access'
          description='Control which phone numbers can sign in during the early-access period.'
        />

        <section className='grid overflow-hidden rounded-lg bg-raised shadow-[inset_0_0_0_1px_var(--line-faint)] md:grid-cols-[minmax(0,1fr)_auto]'>
          <div className='flex items-start gap-4 p-5 sm:p-6'>
            <div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-overlay text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]'>
              <ShieldCheck className='size-5' />
            </div>
            <div className='min-w-0 space-y-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <h2 className='text-sm font-semibold text-ink'>
                  Authentication gate
                </h2>
                {previewQuery.isLoading ? (
                  <Skeleton className='h-5 w-16' />
                ) : (
                  <PreviewAccessStatusBadge
                    active={
                      previewQuery.isError
                        ? null
                        : (previewQuery.data?.enabled ?? false)
                    }
                  />
                )}
              </div>
              <p className='max-w-2xl text-sm leading-6 text-ink-3'>
                This status is read from{' '}
                <code className='rounded-xs bg-white/5 px-1.5 py-0.5 font-mono text-2xs text-ink-2'>
                  PREVIEW_MODE_ENABLED
                </code>{' '}
                on the API. Manage the cohort here, then change the environment
                variable in your deployment when you are ready.
              </p>
            </div>
          </div>
          <div className='grid grid-cols-2 border-t border-line-faint md:min-w-64 md:border-s md:border-t-0'>
            <div className='flex flex-col justify-center px-5 py-4'>
              <span className='label-caps'>Active</span>
              <span className='mt-1 text-2xl font-semibold tracking-[-0.02em] text-ink tabular-nums'>
                {activeCount}
              </span>
            </div>
            <div className='flex flex-col justify-center border-s border-line-faint px-5 py-4'>
              <span className='label-caps'>Total</span>
              <span className='mt-1 text-2xl font-semibold tracking-[-0.02em] text-ink tabular-nums'>
                {entries.length}
              </span>
            </div>
          </div>
        </section>

        {previewQuery.data?.enabled && activeCount === 0 ? (
          <Alert variant='caution'>
            <KeyRound />
            <AlertTitle>No active testers</AlertTitle>
            <AlertDescription>
              Preview mode is active, so phone authentication is currently
              blocked for everyone. Add or reactivate at least one tester.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className='grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]'>
          <Card className='xl:sticky xl:top-16'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Plus className='size-4 text-ink-3' />
                Add a tester
              </CardTitle>
              <CardDescription>
                Numbers are stored in international E.164 format.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className='space-y-4' onSubmit={handleCreate}>
                <div className='grid gap-1.5'>
                  <Label htmlFor='preview-phone' className='text-xs text-ink-2'>
                    Phone number
                  </Label>
                  <Input
                    id='preview-phone'
                    inputMode='tel'
                    placeholder='+919876543210'
                    value={phoneNumber}
                    onChange={(event) => {
                      setPhoneNumber(event.target.value)
                      setFormError(null)
                    }}
                    aria-invalid={Boolean(formError)}
                  />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='preview-label' className='text-xs text-ink-2'>
                    Tester label
                  </Label>
                  <Input
                    id='preview-label'
                    maxLength={120}
                    placeholder='e.g. Sharma family'
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                  <p className='text-xs leading-5 text-ink-3'>
                    Optional. Use a name your team will recognize.
                  </p>
                </div>
                {formError ? (
                  <p className='text-xs text-breach' role='alert'>
                    {formError}
                  </p>
                ) : null}
                <Button
                  className='w-full'
                  disabled={createMutation.isPending}
                  type='submit'
                >
                  <Plus />
                  {createMutation.isPending ? 'Adding tester…' : 'Add tester'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className='min-w-0 gap-0 py-0'>
            <CardHeader className='border-b border-line-faint py-3'>
              <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
                <div>
                  <CardTitle>Allowed testers</CardTitle>
                  <CardDescription className='mt-1'>
                    Inactive entries stay recorded but cannot authenticate.
                  </CardDescription>
                </div>
                <div className='relative w-full sm:w-64'>
                  <SearchIcon className='pointer-events-none absolute start-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-ink-3' />
                  <Input
                    className='ps-9'
                    placeholder='Search phone or label'
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className='p-0'>
              {previewQuery.isLoading ? (
                <div className='space-y-3 p-4'>
                  {[0, 1, 2].map((item) => (
                    <Skeleton className='h-12 w-full' key={item} />
                  ))}
                </div>
              ) : previewQuery.isError ? (
                <div className='p-4'>
                  <Alert variant='destructive'>
                    <AlertTitle>Could not load preview access</AlertTitle>
                    <AlertDescription>
                      <p>
                        {previewQuery.error instanceof Error
                          ? previewQuery.error.message
                          : 'Try loading the list again.'}
                      </p>
                      <Button
                        className='mt-2'
                        size='sm'
                        variant='outline'
                        onClick={() => void previewQuery.refetch()}
                      >
                        Retry
                      </Button>
                    </AlertDescription>
                  </Alert>
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className='flex flex-col items-center px-6 py-12 text-center'>
                  <div className='flex size-10 items-center justify-center rounded-lg bg-overlay text-ink-3 shadow-[inset_0_0_0_1px_var(--line)]'>
                    <UsersRound className='size-5' />
                  </div>
                  <h3 className='mt-4 text-base font-semibold text-ink'>
                    {entries.length === 0
                      ? 'No testers yet'
                      : 'No matching testers'}
                  </h3>
                  <p className='mt-1 max-w-sm text-sm leading-6 text-ink-3'>
                    {entries.length === 0
                      ? 'Add the first approved phone number to prepare your preview cohort.'
                      : 'Try a different phone number or tester label.'}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='ps-4'>Tester</TableHead>
                      <TableHead className='hidden md:table-cell'>
                        Added
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='w-24 pe-4 text-end'>
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => {
                      const updatingThisEntry =
                        updateMutation.isPending &&
                        updateMutation.variables?.entryId === entry.id
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className='ps-4'>
                            <div className='font-medium text-ink'>
                              {entry.label || 'Unlabelled tester'}
                            </div>
                            <div className='mt-0.5 font-mono text-xs tabular-nums text-ink-3'>
                              {entry.phoneNumber}
                            </div>
                          </TableCell>
                          <TableCell className='hidden text-ink-3 md:table-cell'>
                            {formatCreatedAt(entry.createdAt)}
                          </TableCell>
                          <TableCell>
                            <div className='flex items-center gap-3'>
                              <Switch
                                checked={entry.isActive}
                                disabled={updatingThisEntry}
                                aria-label={`${entry.isActive ? 'Disable' : 'Enable'} preview access for ${entry.label || entry.phoneNumber}`}
                                onCheckedChange={(isActive) =>
                                  updateMutation.mutate({
                                    entryId: entry.id,
                                    input: { isActive },
                                  })
                                }
                              />
                              <PreviewAccessStatusBadge
                                active={entry.isActive}
                              />
                            </div>
                          </TableCell>
                          <TableCell className='pe-4'>
                            <div className='flex justify-end gap-1'>
                              <Button
                                aria-label={`Edit ${entry.label || entry.phoneNumber}`}
                                size='icon'
                                variant='ghost'
                                onClick={() => openEdit(entry)}
                              >
                                <Pencil />
                              </Button>
                              <Button
                                aria-label={`Delete ${entry.label || entry.phoneNumber}`}
                                className='text-breach hover:bg-breach-wash hover:text-breach'
                                size='icon'
                                variant='ghost'
                                onClick={() => setDeletingEntry(entry)}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </Main>

      <Dialog
        open={Boolean(editingEntry)}
        onOpenChange={(open) => !open && setEditingEntry(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit tester label</DialogTitle>
            <DialogDescription>
              Change the internal name for {editingEntry?.phoneNumber}. The
              phone number itself cannot be edited.
            </DialogDescription>
          </DialogHeader>
          <form
            className='space-y-4'
            onSubmit={(event) => {
              event.preventDefault()
              if (!editingEntry) return
              updateMutation.mutate({
                entryId: editingEntry.id,
                input: { label: editLabel.trim() || null },
              })
            }}
          >
            <div className='space-y-2'>
              <Label htmlFor='edit-preview-label'>Tester label</Label>
              <Input
                id='edit-preview-label'
                maxLength={120}
                autoFocus
                value={editLabel}
                onChange={(event) => setEditLabel(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setEditingEntry(null)}
              >
                Cancel
              </Button>
              <Button disabled={updateMutation.isPending} type='submit'>
                {updateMutation.isPending ? 'Saving…' : 'Save label'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        destructive
        open={Boolean(deletingEntry)}
        onOpenChange={(open) => !open && setDeletingEntry(null)}
        title='Remove preview access entry?'
        desc={
          <>
            This permanently removes{' '}
            <strong>
              {deletingEntry?.label || deletingEntry?.phoneNumber}
            </strong>{' '}
            from the list. Their user account and current sessions are not
            affected.
          </>
        }
        confirmText={deleteMutation.isPending ? 'Removing…' : 'Remove entry'}
        isLoading={deleteMutation.isPending}
        handleConfirm={() =>
          deletingEntry && deleteMutation.mutate(deletingEntry.id)
        }
      />
    </>
  )
}
