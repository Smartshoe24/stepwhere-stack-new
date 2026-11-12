import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** A `dt`/`dd` grid for record details. */
export function KeyValueList({
  children,
  className,
  columns = 1,
}: {
  children: ReactNode
  className?: string
  columns?: 1 | 2 | 3
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-3',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 xl:grid-cols-3',
        className
      )}
    >
      {children}
    </dl>
  )
}

export function KeyValue({
  label,
  value,
  mono,
  className,
}: {
  label: ReactNode
  value: ReactNode
  mono?: boolean
  className?: string
}) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <dt className='label-caps'>{label}</dt>
      <dd
        className={cn(
          'min-w-0 text-sm break-words text-ink',
          mono && 'font-mono text-xs tabular'
        )}
      >
        {value ?? <span className='text-ink-3'>—</span>}
      </dd>
    </div>
  )
}

/** Label above a form control, with optional help or error text. */
export function FormField({
  label,
  htmlFor,
  help,
  error,
  children,
  className,
}: {
  label: ReactNode
  htmlFor?: string
  help?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={htmlFor} className='text-xs font-medium text-ink-2'>
        {label}
      </Label>
      {children}
      {error ? (
        <p className='text-xs text-breach'>{error}</p>
      ) : help ? (
        <p className='text-xs text-ink-3'>{help}</p>
      ) : null}
    </div>
  )
}

/** Controlled text input with a label (settings-style forms in dialogs). */
export function LabeledInput({
  label,
  value,
  onChange,
  type = 'text',
  id,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  id?: string
}) {
  const inputId =
    id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <FormField label={label} htmlFor={inputId}>
      <Input
        id={inputId}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  )
}

/** An icon row for telemetry readouts: label above a value, icon to the left. */
export function MetricRow({
  icon: Icon,
  label,
  value,
  meta,
  className,
}: {
  icon: React.ElementType
  label: ReactNode
  value: ReactNode
  meta?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start gap-3 py-2.5', className)}>
      <Icon className='mt-0.5 size-4 shrink-0 text-ink-3' />
      <div className='min-w-0 space-y-0.5'>
        <div className='label-caps'>{label}</div>
        <div className='text-sm font-medium break-words text-ink capitalize'>
          {value}
        </div>
        {meta ? <div className='text-xs text-ink-3'>{meta}</div> : null}
      </div>
    </div>
  )
}

/** Divided stack of MetricRows. */
export function MetricList({ children }: { children: ReactNode }) {
  return <div className='-my-2.5 divide-y divide-line-faint'>{children}</div>
}
