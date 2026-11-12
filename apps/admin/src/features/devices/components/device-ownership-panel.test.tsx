import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { toast } from 'sonner'
import { releaseAdminDeviceOwnership } from '@/lib/api-client'
import { DeviceOwnershipPanel } from './device-ownership-panel'

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>()
  return { ...actual, releaseAdminDeviceOwnership: vi.fn() }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('@/features/admin/components/record-preview-link', () => ({
  RecordPreviewLink: ({ label }: { label: string }) => <span>{label}</span>,
}))

const ownership = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  organizationName: 'Sharma Family',
  claimedAt: '2026-10-01T10:00:00.000Z',
}

const unboundDevice = {
  id: '22222222-2222-4222-8222-222222222222',
  hardwareIdentifier: '869938082392516',
  activeBinding: null,
  ownership,
}

function renderPanel(device: React.ComponentProps<typeof DeviceOwnershipPanel>['device']) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DeviceOwnershipPanel device={device} />
    </QueryClientProvider>
  )
}

describe('DeviceOwnershipPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(releaseAdminDeviceOwnership).mockResolvedValue({
      deviceId: unboundDevice.id,
      released: true,
    })
  })

  it('says nobody owns the shoe when there is no claim', async () => {
    const screen = await renderPanel({ ...unboundDevice, ownership: null })

    await expect.element(screen.getByText(/No family owns this shoe/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Release ownership' }).query()).toBeNull()
  })

  it('disables release while the shoe is bound to a child', async () => {
    const screen = await renderPanel({
      ...unboundDevice,
      activeBinding: {
        childId: '33333333-3333-4333-8333-333333333333',
        childName: 'Aarav',
        boundAt: '2026-10-02T10:00:00.000Z',
      },
    } as never)

    await expect.element(screen.getByText(/Unbind the shoe from Aarav/)).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Release ownership' })).toBeDisabled()
  })

  it('needs a reason, then releases and confirms', async () => {
    const screen = await renderPanel(unboundDevice)

    await expect.element(screen.getByText('Sharma Family')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Release ownership' }))

    const dialog = screen.getByRole('alertdialog')
    await expect.element(dialog.getByText(/so a different family can bind it/)).toBeVisible()
    const confirm = dialog.getByRole('button', { name: 'Release ownership' })
    await expect.element(confirm).toBeDisabled()

    await userEvent.fill(dialog.getByLabelText('Reason'), 'short')
    await expect.element(confirm).toBeDisabled()

    await userEvent.fill(dialog.getByLabelText('Reason'), '  Returned shoe, moving to a new family  ')
    await expect.element(confirm).toBeEnabled()
    await userEvent.click(confirm)

    await vi.waitFor(() => {
      expect(releaseAdminDeviceOwnership).toHaveBeenCalledWith({
        deviceId: unboundDevice.id,
        reason: 'Returned shoe, moving to a new family',
      })
      expect(toast.success).toHaveBeenCalledWith(
        'Ownership released. Another family can now bind this shoe.'
      )
    })
  })
})
