const DEVICE_SESSION_ID_KEY = 'cet-device-session-id'

interface DeviceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface LocalSignOutAuth {
  signOut(options: { scope: 'local' }): PromiseLike<unknown>
}

function generateDeviceSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getOrCreateDeviceSessionId(
  storage: DeviceStorage = window.localStorage,
): string {
  let id = storage.getItem(DEVICE_SESSION_ID_KEY)
  if (!id) {
    id = generateDeviceSessionId()
    storage.setItem(DEVICE_SESSION_ID_KEY, id)
  }
  return id
}

export async function signOutCurrentDevice(auth: LocalSignOutAuth): Promise<void> {
  await auth.signOut({ scope: 'local' })
}
