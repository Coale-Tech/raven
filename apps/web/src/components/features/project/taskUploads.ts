export type TaskUploadPolicy = {
    max_file_bytes: number
    allowed_extensions: string[] | null
    max_attachments: number | null
    remaining: number | null
}

export type TaskAttachment = {
    name: string
    file_url: string
    file_name: string
}

export type TaskUploadItem = {
    id: string
    file: File
    status: "selected" | "uploading" | "uploaded" | "failed"
    progress: number
    attachment?: TaskAttachment
    error?: string
}

export type TaskUploadState = {
    task: string | null
    items: TaskUploadItem[]
}

export type TaskUploadAction =
    | { type: "add"; items: { id: string; file: File }[] }
    | { type: "created"; task: string }
    | { type: "start" | "retry" | "remove"; id: string }
    | { type: "progress"; id: string; progress: number }
    | { type: "uploaded"; id: string; attachment: TaskAttachment }
    | { type: "failed"; id: string; error: string }

/** Count pending selections only; remaining already accounts for saved Files. */
export function taskFileRejection(file: File, pendingCount: number, policy: TaskUploadPolicy): "size" | "type" | "count" | null {
    if (file.size > policy.max_file_bytes) return "size"
    if (policy.allowed_extensions !== null) {
        const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : ""
        if (!policy.allowed_extensions.some(allowed => allowed.replace(/^\./, "").toLowerCase() === extension)) return "type"
    }
    const remaining = policy.remaining ?? policy.max_attachments
    if (remaining !== null && pendingCount >= remaining) return "count"
    return null
}

/** Pure task-local state: network/Task creation stays in the owning component. */
export function taskUploadReducer(state: TaskUploadState, action: TaskUploadAction): TaskUploadState {
    if (action.type === "created") {
        if (!action.task || (state.task !== null && state.task !== action.task)) throw new Error("task_upload_identity_changed")
        return state.task === action.task ? state : { ...state, task: action.task }
    }
    if (action.type === "add") {
        const ids = new Set(state.items.map(item => item.id))
        const items: TaskUploadItem[] = []
        for (const item of action.items) {
            if (ids.has(item.id)) continue
            ids.add(item.id)
            items.push({ ...item, status: "selected", progress: 0 })
        }
        return items.length ? { ...state, items: [...state.items, ...items] } : state
    }
    const index = state.items.findIndex(item => item.id === action.id)
    if (index === -1) return state
    const item = state.items[index]
    let replacement: TaskUploadItem
    switch (action.type) {
        case "remove":
            if (item.status === "uploaded" || item.status === "uploading") return state
            return { ...state, items: state.items.filter((_, current) => current !== index) }
        case "start":
            if (!state.task) throw new Error("task_upload_requires_task")
            if (item.status !== "selected") return state
            replacement = { ...item, status: "uploading", progress: 0, error: undefined }
            break
        case "retry":
            if (item.status !== "failed") return state
            replacement = { ...item, status: "selected", progress: 0, error: undefined }
            break
        case "progress":
            if (item.status !== "uploading" || !Number.isFinite(action.progress)) return state
            replacement = { ...item, progress: Math.min(100, Math.max(0, action.progress)) }
            break
        case "uploaded":
            if (item.status !== "uploading") return state
            replacement = { ...item, status: "uploaded", progress: 100, attachment: action.attachment, error: undefined }
            break
        case "failed":
            if (item.status !== "uploading") return state
            replacement = { ...item, status: "failed", error: action.error }
            break
    }
    return { ...state, items: state.items.map((current, position) => position === index ? replacement : current) }
}
