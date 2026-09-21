import { useEffect, useState } from "react"
import { ChevronRight, Trash2 } from "lucide-react"
import { Button } from "@components/ui/button"
import { Input } from "@components/ui/input"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@components/ui/alert-dialog"
import _ from "@lib/translate"
import { revokeTokens, signIn, tokenStore } from "./auth"
import { pendingNotice, pendingRelogin } from "./pending"
import { unsubscribeSitePush } from "./push"
import { forgetSite, loadSites, normalizeSiteUrl, probeSite, saveSite, setDefaultSite, wipeSiteData, type ProbeResult, type Site } from "./sites"
import { versionAtLeast, versionMismatch } from "./version"

type ProbeError = Exclude<ProbeResult, { site: Site }>["error"]
/** A failure the picker words itself; anything else shows the thrown message as is. */
class PickerError extends Error {
    constructor(readonly kind: ProbeError | "no-address") { super(kind) }
}

const appVersion = async () => (await import("@capacitor/app")).App.getInfo().then((i) => i.version).catch(() => "0")

/** Opens a saved site: silent when tokens exist, else the browser login. */
const open = async (site: Site) => {
    // A record without the handshake fields is completed once, before it can open.
    if (!site.sitename || !site.clientId) {
        const result = await probeSite(site.url)
        if ("error" in result) throw new PickerError(result.error)
        site = result.site
    }
    if (!(await tokenStore.get(site.url))) await signIn(site.url, site.clientId)
    await saveSite(site)
    await setDefaultSite(site.url)
    const notice = await versionNotice(site)
    if (notice) await pendingNotice.set(JSON.stringify(notice))
    window.location.replace("/")
    // The page is leaving: never settle, so the picker stays busy until it does.
    return new Promise<void>(() => { })
}

/** What the app toasts once it is up; worded there, where it is shown. */
export type VersionNotice = { kind: "mismatch"; site: string; app: string } | { kind: "update" }

const versionNotice = async (site: Site): Promise<VersionNotice | null> => {
    if (versionMismatch(site.ravenVersion, __RAVEN_VERSION__)) return { kind: "mismatch", site: site.ravenVersion, app: __RAVEN_VERSION__ }
    if (site.minAppVersion && !versionAtLeast(await appVersion(), site.minAppVersion)) return { kind: "update" }
    return null
}

/** The site's logo, or its initial on a tile when there is none or it fails to load. */
const SiteLogo = ({ site }: { site: Site }) => {
    const [failed, setFailed] = useState(false)
    if (!site.logo || failed) {
        return <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-gray-3 text-lg font-semibold text-ink-gray-7">{site.name.slice(0, 1).toUpperCase()}</span>
    }
    return <img src={new URL(site.logo, site.url).href} alt="" className="size-10 shrink-0 rounded-md" onError={() => setFailed(true)} />
}

export const SitePicker = () => {
    const [sites, setSites] = useState<Site[]>([])
    const [url, setUrl] = useState("")
    const [busy, setBusy] = useState<string | null>(null)
    const [error, setError] = useState<PickerError | string | null>(null)
    const [removing, setRemoving] = useState<Site | null>(null)

    useEffect(() => {
        loadSites().then(async (list) => {
            setSites(list)
            // A dead session lands here with its site named; sign it in again without a tap.
            const url = await pendingRelogin.take()
            const site = url && list.find((s) => s.url === url)
            if (site) run(site.url, () => open(site))
        })
    }, [])

    const run = async (key: string, action: () => Promise<void>) => {
        setBusy(key)
        setError(null)
        try {
            await action()
        } catch (e) {
            setError(e instanceof PickerError ? e : String((e as { message?: string })?.message ?? e))
        } finally {
            setBusy(null)
        }
    }

    const addSite = () => run("add", async () => {
        const origin = normalizeSiteUrl(url)
        if (!origin) throw new PickerError("no-address")
        const result = await probeSite(origin)
        if ("error" in result) throw new PickerError(result.error)
        await open(result.site)
    })

    const remove = (site: Site) => run(site.url, async () => {
        setRemoving(null)
        // Everything local goes first and at once: a site that has stopped answering must not hold the picker.
        const tokens = await tokenStore.get(site.url)
        await tokenStore.remove(site.url)
        await forgetSite(site.url)
        await wipeSiteData(site.url)
        setSites(await loadSites())
        // The site's side runs on unawaited. The unsubscribe needs the bearer, so it goes before the revoke.
        if (tokens) void unsubscribeSitePush(site, tokens.accessToken).then(() => revokeTokens(site.url, tokens))
    })

    return (
        <main className="min-h-dvh bg-surface-white text-ink-gray-9 flex flex-col gap-6 px-5 pt-[calc(var(--inset-top)+3rem)] pb-8 max-w-md mx-auto w-full">
            <h1 className="text-3xl font-semibold">raven</h1>
            {sites.length > 0 && (
                <section className="flex flex-col gap-2">
                    <p className="text-sm text-ink-gray-6">{_("Select a site")}</p>
                    <ul className="flex flex-col gap-2">
                        {sites.map((site) => (
                            <li key={site.url} className="flex items-center gap-2">
                                <button type="button" disabled={busy !== null} onClick={() => run(site.url, () => open(site))}
                                    className="flex flex-1 items-center gap-3 rounded-lg bg-surface-gray-2 px-3 py-3 text-left active:bg-surface-gray-3">
                                    <SiteLogo site={site} />
                                    <span className="flex flex-1 flex-col min-w-0">
                                        <span className="text-base font-medium truncate">{site.name}</span>
                                        <span className="text-sm text-ink-gray-6 truncate">{new URL(site.url).host}</span>
                                    </span>
                                    <ChevronRight className="text-ink-gray-5" />
                                </button>
                                <Button type="button" variant="ghost" size="md" isIconButton aria-label={_("Remove site")} disabled={busy !== null} onClick={() => setRemoving(site)}>
                                    <Trash2 />
                                </Button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); addSite() }}>
                <label htmlFor="site-url" className="text-sm text-ink-gray-6">{_("Site URL")}</label>
                {/* type="text": a type="url" input rejects a bare host; normalizeSiteUrl adds the scheme. */}
                <Input id="site-url" type="text" inputMode="url" placeholder="raven.frappe.cloud" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    value={url} onChange={(e) => setUrl(e.target.value)} />
                <Button type="submit" variant="solid" size="lg" loading={busy === "add"} loadingText={_("Connecting…")}>{_("Add site")}</Button>
            </form>
            <p role="alert" className="min-h-5 text-sm text-ink-red-6">
                {typeof error === "string" && error}
                {error instanceof PickerError && error.kind === "no-address" && _("Enter a site address.")}
                {error instanceof PickerError && error.kind === "unreachable" && _("Could not reach this site.")}
                {error instanceof PickerError && error.kind === "not-raven" && _("This does not look like a Raven site.")}
                {error instanceof PickerError && error.kind === "site-too-old" && _("This site runs an older Raven. Ask its admin to update.")}
                {error instanceof PickerError && error.kind === "no-client" && _("This site has no OAuth client for the app. Ask its admin to set one up in Raven Settings.")}
            </p>
            <AlertDialog open={removing !== null} onOpenChange={(o) => { if (!o) setRemoving(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl font-semibold">{_("Remove {0}?", [removing?.name ?? ""])}</AlertDialogTitle>
                        <AlertDialogDescription>{_("You will be logged out of this site on this device.")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{_("Cancel")}</AlertDialogCancel>
                        <Button type="button" variant="solid" theme="red" size="md" onClick={() => removing && remove(removing)}>{_("Remove")}</Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </main>
    )
}
