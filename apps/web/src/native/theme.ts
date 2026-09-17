import { isNative, withPrefs } from "./platform"

const APP_THEME_KEY = "appTheme"

// Mirrored for RavenApplication (Android) and SceneDelegate (iOS): they theme the canvas at launch.
export const syncNativeTheme = (theme: "light" | "dark" | "system") => {
    if (!isNative()) return
    withPrefs((p) => p.set({ key: APP_THEME_KEY, value: theme })).catch(() => { })
}
