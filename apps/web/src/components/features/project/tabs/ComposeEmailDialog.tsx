import { useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { useFrappeFileUpload, useFrappePostCall, type FrappeError } from "frappe-react-sdk"
import { PaperclipIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@components/ui/button"
import {
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@components/ui/dialog"
import { errorResponseToast } from "@components/ui/error-banner"
import { Input } from "@components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select"
import { Textarea } from "@components/ui/textarea"
import _ from "@lib/translate"
import { Field } from "./CreateTaskDialog"

export type EmailDefaults = {
    to: string
    cc: string
    subject: string
    inReplyTo: string | null
    task: string | null
}

type Attached = { name: string; file_name: string }

const NO_TASK = "none"

/** Communication tab → "Send email" / "Reply". Plain-text body; sent and logged on the Project. */
export default function ComposeEmailDialog({
    project,
    tasks,
    defaults,
    onOpenChange,
    onSent,
}: {
    project: string
    tasks: { name: string; subject: string }[]
    defaults: EmailDefaults
    onOpenChange: (open: boolean) => void
    onSent: () => void
}) {
    const { call: send, loading: sending } = useFrappePostCall("raven.api.customer_outreach.send_project_email")
    const { upload, loading: uploading } = useFrappeFileUpload()
    const fileInput = useRef<HTMLInputElement>(null)

    const [to, setTo] = useState(defaults.to)
    const [cc, setCc] = useState(defaults.cc)
    const [subject, setSubject] = useState(defaults.subject)
    const [task, setTask] = useState(defaults.task ?? NO_TASK)
    const [message, setMessage] = useState("")
    const [files, setFiles] = useState<Attached[]>([])

    const onPickFiles = async (e: ChangeEvent<HTMLInputElement>) => {
        const picked = Array.from(e.target.files ?? [])
        e.target.value = ""
        try {
            // Unattached private uploads: the server copies them onto the Communication when sending.
            const done = await Promise.all(picked.map((f) => upload(f, { isPrivate: true })))
            setFiles((prev) => [...prev, ...done.map((d) => ({ name: d.name, file_name: d.file_name }))])
        } catch (err) {
            errorResponseToast(_("Could not upload file"), err as FrappeError)
        }
    }

    const onSubmit = (e: FormEvent) => {
        e.preventDefault()
        send({
            project,
            recipients: to,
            cc: cc || undefined,
            subject,
            message,
            attachments: files.length ? files.map((f) => f.name) : undefined,
            in_reply_to: defaults.inReplyTo || undefined,
            task: task === NO_TASK ? undefined : task,
        })
            .then(() => {
                toast.success(_("Email sent to {0}", [to]))
                onSent()
                onOpenChange(false)
            })
            .catch((err: FrappeError) => errorResponseToast(_("Could not send"), err))
    }

    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={onSubmit} className="flex min-h-0 flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle>{defaults.inReplyTo ? _("Reply") : _("Send email")}</DialogTitle>
                        <DialogDescription className="sr-only">
                            {_("Email about this project. A copy is logged in the Communication tab.")}
                        </DialogDescription>
                    </DialogHeader>

                    <DialogBody className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto">
                        <Field label={_("To")} htmlFor="mail-to">
                            <Input
                                id="mail-to"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                placeholder={_("name@example.com, other@example.com")}
                            />
                        </Field>
                        <Field label={_("Cc")} htmlFor="mail-cc">
                            <Input id="mail-cc" value={cc} onChange={(e) => setCc(e.target.value)} />
                        </Field>
                        <Field label={_("Subject")} htmlFor="mail-subject">
                            <Input id="mail-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                        </Field>
                        {tasks.length > 0 && (
                            <Field label={_("About task")}>
                                <Select value={task} onValueChange={setTask}>
                                    <SelectTrigger inputSize="md">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NO_TASK}>{_("No specific task")}</SelectItem>
                                        {tasks.map((t) => (
                                            <SelectItem key={t.name} value={t.name}>
                                                {t.subject}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}
                        <Field label={_("Message")} htmlFor="mail-message">
                            <Textarea
                                id="mail-message"
                                rows={8}
                                autoFocus
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                            />
                        </Field>

                        <div className="flex flex-col gap-2">
                            {files.map((f) => (
                                <div
                                    key={f.name}
                                    className="flex items-center gap-2 rounded-md border border-outline-gray-2 px-2 py-1 text-sm"
                                >
                                    <PaperclipIcon className="size-4 shrink-0 text-ink-gray-5" />
                                    <span className="min-w-0 flex-1 truncate">{f.file_name}</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        isIconButton
                                        aria-label={_("Remove attachment")}
                                        onClick={() => setFiles((prev) => prev.filter((p) => p.name !== f.name))}
                                    >
                                        <XIcon />
                                    </Button>
                                </div>
                            ))}
                            <input ref={fileInput} type="file" multiple hidden onChange={onPickFiles} />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="self-start"
                                loading={uploading}
                                onClick={() => fileInput.current?.click()}
                            >
                                <PaperclipIcon />
                                {_("Attach files")}
                            </Button>
                        </div>
                    </DialogBody>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
                            {_("Cancel")}
                        </Button>
                        <Button
                            type="submit"
                            loading={sending}
                            disabled={!to.trim() || !subject.trim() || !message.trim() || uploading}
                        >
                            {_("Send")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
