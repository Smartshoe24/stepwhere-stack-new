import { Wordmark } from '@/assets/brand'

export function RoutePending() {
  return (
    <div
      role='status'
      aria-live='polite'
      className='grid min-h-svh place-items-center bg-canvas px-4'
    >
      <div className='flex flex-col items-center gap-4'>
        <Wordmark className='h-3.5 opacity-90' />
        <span className='relative h-px w-24 overflow-hidden bg-line'>
          <span className='absolute inset-y-0 w-1/2 animate-[trail-shimmer_1.2s_linear_infinite] bg-trail bg-[length:240%_100%]' />
        </span>
        <span className='sr-only'>Connecting to Stepwhere Admin</span>
      </div>
    </div>
  )
}
