import { Toaster as Sonner, ToasterProps } from 'sonner'

export function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme='dark'
      className='toaster group [&_div[data-content]]:w-full'
      style={
        {
          '--normal-bg': 'var(--night-overlay)',
          '--normal-text': 'var(--ink)',
          '--normal-border': 'var(--line)',
          '--success-bg': 'var(--night-overlay)',
          '--success-text': 'var(--ink)',
          '--success-border': 'var(--line)',
          '--error-bg': 'var(--night-overlay)',
          '--error-text': 'var(--ink)',
          '--error-border': 'rgb(248 113 113 / 0.3)',
          '--border-radius': '8px',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}
