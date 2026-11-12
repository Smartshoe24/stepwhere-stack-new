export function SkipToMain() {
  return (
    <a
      className='focus-trail fixed start-4 top-3 z-999 -translate-y-20 rounded-md bg-act-fill px-3 py-1.5 text-sm font-semibold text-on-act-fill shadow-[inset_0_0_0_1px_var(--act-fill-line)] transition focus:translate-y-0'
      href='#content'
    >
      Skip to content
    </a>
  )
}
