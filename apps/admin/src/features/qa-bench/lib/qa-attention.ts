import type { QaAttentionDto } from '@stepwhere/types'
import { toast } from 'sonner'

type AudioContextCtor = typeof AudioContext

let audioContext: AudioContext | null = null

function beep(level: QaAttentionDto['level']) {
  try {
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioContextCtor })
        .webkitAudioContext
    if (!Ctor) return
    audioContext ??= new Ctor()
    const ctx = audioContext
    if (ctx.state === 'suspended') void ctx.resume()

    // Errors: two low beeps. Warnings: one mid beep. Success: one high beep.
    const tones =
      level === 'error' ? [330, 330] : level === 'warning' ? [550] : [880]
    tones.forEach((frequency, index) => {
      const start = ctx.currentTime + index * 0.25
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(start)
      oscillator.stop(start + 0.2)
    })
  } catch {
    // Sound is a nice-to-have; browsers may block it until the page is clicked.
  }
}

export function showQaAttention(attention: QaAttentionDto) {
  const title = attention.slotLabel
    ? `${attention.slotLabel}: ${attention.title}`
    : attention.title
  const options = {
    description: attention.message,
    duration: attention.level === 'error' ? 20_000 : 8_000,
  }
  if (attention.level === 'error') toast.error(title, options)
  else if (attention.level === 'warning') toast.warning(title, options)
  else toast.success(title, options)
  beep(attention.level)
}
