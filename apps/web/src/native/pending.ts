import { withPrefs } from "./platform"

const KEY = "pendingPath"

// A path to open after the reload a push tap to another site or a share on the picker causes.
export const setPendingPath = (path: string) => withPrefs((p) => p.set({ key: KEY, value: path }))

export const takePendingPath = async (): Promise<string | null> => {
    const { value } = await withPrefs((p) => p.get({ key: KEY }))
    if (value) await withPrefs((p) => p.remove({ key: KEY }))
    return value ?? null
}
