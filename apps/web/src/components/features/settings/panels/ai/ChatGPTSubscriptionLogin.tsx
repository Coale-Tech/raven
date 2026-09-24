import { useEffect, useRef, useState } from "react"
import { useFrappeGetCall, useFrappePostCall, type FrappeError } from "frappe-react-sdk"
import { toast } from "sonner"
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react"
import { Button } from "@components/ui/button"
import { Spinner } from "@components/ui/spinner"
import { errorResponseToast } from "@components/ui/error-banner"
import _ from "@lib/translate"

interface ChatGPTAuthStatus {
    connected: boolean
    account_label?: string
    account_id?: string
    expires_at?: number
    expired?: boolean
}

interface StartLoginResponse {
    success: boolean
    user_code?: string
    verification_url?: string
    interval?: number
    expires_at?: number
    error?: string
}

interface PollLoginResponse {
    success: boolean
    status?: "pending" | "connected" | "expired" | "denied" | "error"
    account?: string
    error?: string
}

/**
 * Device-code sign-in for the ChatGPT Subscription provider: connect, poll until
 * approved, disconnect. Polling is a setTimeout chain (not setInterval) so a slow
 * poll request never overlaps the next one, and it is cancelled on unmount.
 */
const ChatGPTSubscriptionLogin = () => {
    const { data, mutate, isLoading } = useFrappeGetCall<{ message: ChatGPTAuthStatus }>(
        "raven.ai.openai_codex_auth.chatgpt_auth_status",
        undefined,
        undefined,
        { revalidateOnFocus: false },
    )
    const { call: startLogin, loading: starting } = useFrappePostCall<{ message: StartLoginResponse }>(
        "raven.ai.openai_codex_auth.start_chatgpt_login",
    )
    const { call: pollLogin } = useFrappePostCall<{ message: PollLoginResponse }>(
        "raven.ai.openai_codex_auth.poll_chatgpt_login",
    )
    const { call: disconnectCall, loading: disconnecting } = useFrappePostCall<{ message: { success: boolean } }>(
        "raven.ai.openai_codex_auth.disconnect_chatgpt",
    )

    const [pending, setPending] = useState<{ user_code: string; verification_url: string } | null>(null)
    const [copied, setCopied] = useState(false)
    const pollTimer = useRef<number | undefined>(undefined)
    const copyResetTimer = useRef<number | undefined>(undefined)
    const cancelled = useRef(false)

    // Stop the poll chain (and the copy-icon reset) the moment this unmounts —
    // otherwise a pending setTimeout fires setState on a gone component.
    useEffect(() => {
        cancelled.current = false
        return () => {
            cancelled.current = true
            window.clearTimeout(pollTimer.current)
            window.clearTimeout(copyResetTimer.current)
        }
    }, [])

    const runPoll = async (intervalSeconds: number) => {
        try {
            const res = await pollLogin({})
            if (cancelled.current) return
            const status = res.message.status
            if (status === "pending") {
                pollTimer.current = window.setTimeout(() => void runPoll(intervalSeconds), intervalSeconds * 1000)
                return
            }
            setPending(null)
            if (status === "connected") {
                toast.success(_("ChatGPT subscription connected."))
                mutate()
            } else if (status === "expired") {
                toast.error(_("The device code expired before it was approved. Try connecting again."))
            } else if (status === "denied") {
                toast.error(_("Sign-in was denied."))
            } else {
                toast.error(res.message.error || _("Could not connect to ChatGPT."))
            }
        } catch (error) {
            if (cancelled.current) return
            setPending(null)
            errorResponseToast(_("Could not check ChatGPT sign-in status"), error as FrappeError)
        }
    }

    const handleConnect = async () => {
        try {
            const res = await startLogin({})
            if (!res.message.success || !res.message.user_code || !res.message.verification_url) {
                toast.error(res.message.error || _("Could not start ChatGPT sign-in."))
                return
            }
            setPending({ user_code: res.message.user_code, verification_url: res.message.verification_url })
            const intervalSeconds = res.message.interval || 5
            pollTimer.current = window.setTimeout(() => void runPoll(intervalSeconds), intervalSeconds * 1000)
        } catch (error) {
            errorResponseToast(_("Could not start ChatGPT sign-in"), error as FrappeError)
        }
    }

    const handleDisconnect = async () => {
        try {
            await disconnectCall({})
            mutate()
        } catch (error) {
            errorResponseToast(_("Could not disconnect ChatGPT subscription"), error as FrappeError)
        }
    }

    const copyCode = () => {
        if (!pending) return
        navigator.clipboard.writeText(pending.user_code).then(() => {
            setCopied(true)
            window.clearTimeout(copyResetTimer.current)
            copyResetTimer.current = window.setTimeout(() => setCopied(false), 1000)
        }).catch(() => toast.error(_("Failed to copy to clipboard")))
    }

    const status = data?.message

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-ink-gray-5">
                <Spinner size="sm" /> {_("Checking status…")}
            </div>
        )
    }

    if (status?.connected) {
        return (
            <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-ink-gray-7">
                    {_("Connected as {0}", [status.account_label || status.account_id || ""])}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={handleDisconnect} loading={disconnecting}>
                    {_("Disconnect")}
                </Button>
            </div>
        )
    }

    if (pending) {
        return (
            <div className="flex flex-col gap-2">
                <p className="text-sm text-ink-gray-6">
                    {_("Enter this code at the verification page to finish signing in.")}
                </p>
                <div className="flex items-center gap-2">
                    <code className="rounded bg-surface-gray-2 px-2 py-1 text-base font-mono tracking-widest">
                        {pending.user_code}
                    </code>
                    <Button type="button" variant="ghost" size="sm" isIconButton aria-label={_("Copy code")} onClick={copyCode}>
                        {copied ? <CheckIcon className="text-ink-green-8" /> : <CopyIcon />}
                    </Button>
                </div>
                <a
                    href={pending.verification_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-1 text-sm text-ink-blue-3 hover:underline"
                >
                    {_("Approve at {0}", [pending.verification_url])}
                    <ExternalLinkIcon className="size-3.5" />
                </a>
                <p className="text-p-sm text-ink-gray-5">{_("Waiting for approval…")}</p>
            </div>
        )
    }

    return (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={handleConnect} loading={starting}>
            {_("Connect")}
        </Button>
    )
}

export default ChatGPTSubscriptionLogin
