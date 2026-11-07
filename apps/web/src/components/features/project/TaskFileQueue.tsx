import { useEffect, useReducer, useRef, useState } from "react"
import { useFrappeFileUpload } from "frappe-react-sdk"
import { Button } from "@components/ui/button"
import { FileDropzone } from "@components/ui/file-dropzone"
import { Progress } from "@components/ui/progress"
import { taskFileRejection, taskUploadReducer, type TaskUploadAction, type TaskUploadPolicy, type TaskUploadState } from "./taskUploads"
import _ from "@lib/translate"

export type TaskFileQueueController = {
    state: TaskUploadState
    add: (files: File[]) => void
    uploadAll: (task: string) => Promise<void>
    retry: (id: string) => Promise<void>
    remove: (id: string) => void
    selectionError: string
    busy: boolean
}

export function useTaskFileQueue(task: string | null, policy: TaskUploadPolicy): TaskFileQueueController {
    const [state, dispatch] = useReducer(taskUploadReducer, { task, items: [] })
    const current = useRef(state)
    const active = useRef<string | null>(null)
    const running = useRef(false)
    const limits = useRef(policy)
    const [selectionError, setSelectionError] = useState("")
    const { upload, progress } = useFrappeFileUpload()
    const send = (action: TaskUploadAction) => { current.current = taskUploadReducer(current.current, action); dispatch(action) }
    useEffect(() => { if (active.current) { const action: TaskUploadAction = { type: "progress", id: active.current, progress }; current.current = taskUploadReducer(current.current, action); dispatch(action) } }, [progress])
    const add = (files: File[]) => {
        const items: { id: string; file: File }[] = []
        let error = ""
        for (const file of files) {
            const reason = taskFileRejection(file, current.current.items.length + items.length, limits.current)
            if (reason) error = reason === "size" ? _("A file exceeds the site's size limit") : reason === "type" ? _("A file type is not allowed by this site") : _("The task attachment limit has been reached")
            else items.push({ id: crypto.randomUUID(), file })
        }
        setSelectionError(error)
        send({ type: "add", items })
    }
    const uploadAll = async (taskName: string) => {
        if (running.current) return
        running.current = true
        send({ type: "created", task: taskName })
        try {
            for (const item of current.current.items) {
                if (item.status !== "selected") continue
                active.current = item.id
                send({ type: "start", id: item.id })
                try {
                    const file = await upload(item.file, { doctype: "Task", docname: taskName, isPrivate: true })
                    send({ type: "uploaded", id: item.id, attachment: { name: file.name, file_name: file.file_name, file_url: file.file_url } })
                } catch (error) {
                    const message = error && typeof error === "object" && "message" in error ? String(error.message) : _("Upload failed; retry this file")
                    send({ type: "failed", id: item.id, error: message })
                }
            }
        } finally { active.current = null; running.current = false }
    }
    const retry = async (id: string) => {
        if (!current.current.task || running.current) return
        send({ type: "retry", id })
        await uploadAll(current.current.task)
    }
    return { state, add, uploadAll, retry, remove: (id: string) => send({ type: "remove", id }), selectionError, busy: state.items.some(item => item.status === "uploading") }
}

export default function TaskFileQueue({ queue, policy, disabled = false }: { queue: TaskFileQueueController; policy: TaskUploadPolicy; disabled?: boolean }) {
    return <div className="flex flex-col gap-2">
        <p className="text-xs text-ink-gray-5">{_("Private task attachments")} · {_("Maximum file size")}: {(policy.max_file_bytes / 1048576).toFixed(1)} MB · {policy.allowed_extensions?.join(", ") || _("All file types")} · {policy.remaining === null ? _("No attachment count limit") : _("Remaining slots: {0}", [String(policy.remaining)])}</p>
        {!disabled && <FileDropzone files={[]} onDrop={queue.add} />}
        {queue.selectionError && <p role="alert" className="text-sm text-ink-red-4">{queue.selectionError}</p>}
        <ul className="flex flex-col gap-2">{queue.state.items.map(item => <li key={item.id} className="rounded border border-outline-gray-2 p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2"><span className="min-w-0 break-all">{item.file.name}</span><span className="text-ink-gray-5">{_(item.status)}</span>
                {item.status === "uploaded" && item.attachment && <a className="text-ink-blue-3 underline" href={item.attachment.file_url} target="_blank" rel="noreferrer">{_("Open private file")}</a>}
                {item.status === "failed" && <Button type="button" variant="outline" size="sm" disabled={queue.busy} onClick={() => void queue.retry(item.id)}>{_("Retry file")}</Button>}
                {["selected", "failed"].includes(item.status) && <Button type="button" variant="ghost" size="sm" disabled={queue.busy} onClick={() => queue.remove(item.id)}>{_("Remove selection")}</Button>}
            </div>
            {item.status === "uploading" && <Progress value={item.progress} size="sm" />}
            {item.error && <p role="alert" className="text-ink-red-4">{item.error}</p>}
        </li>)}</ul>
    </div>
}
