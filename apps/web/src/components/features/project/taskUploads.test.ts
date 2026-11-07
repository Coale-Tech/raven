import { describe, expect, it } from "vitest"
import { taskFileRejection, taskUploadReducer, type TaskUploadState } from "./taskUploads"

const file = (name: string, size = 4) => new File([new Uint8Array(size)], name)
const empty = (): TaskUploadState => ({ task: null, items: [] })
const policy = { max_file_bytes: 10, allowed_extensions: ["pdf", "png"], max_attachments: 3, remaining: 2 }

describe("task file selection", () => {
    it("enforces the actual byte, extension and remaining-count boundaries", () => {
        expect(taskFileRejection(file("brief.PDF", 10), 1, policy)).toBeNull()
        expect(taskFileRejection(file("brief.pdf", 11), 0, policy)).toBe("size")
        expect(taskFileRejection(file("brief.pdf.exe"), 0, policy)).toBe("type")
        expect(taskFileRejection(file("brief.pdf"), 2, policy)).toBe("count")
        expect(taskFileRejection(file("brief"), 0, { ...policy, allowed_extensions: null, remaining: null, max_attachments: null })).toBeNull()
    })
})

describe("task upload queue", () => {
    it("retains the created task and successful file when retrying only a failed selection", () => {
        let state = taskUploadReducer(empty(), { type: "add", items: [{ id: "a", file: file("screen.png") }, { id: "b", file: file("brief.pdf") }] })
        state = taskUploadReducer(state, { type: "created", task: "TASK-2026-00001" })
        state = taskUploadReducer(state, { type: "start", id: "a" })
        state = taskUploadReducer(state, { type: "uploaded", id: "a", attachment: { name: "FILE-A", file_url: "/private/files/screen.png", file_name: "screen.png" } })
        state = taskUploadReducer(state, { type: "start", id: "b" })
        state = taskUploadReducer(state, { type: "failed", id: "b", error: "network unavailable" })
        state = taskUploadReducer(state, { type: "retry", id: "b" })
        expect(state.task).toBe("TASK-2026-00001")
        expect(state.items.filter(item => item.status === "selected").map(item => item.id)).toEqual(["b"])
        expect(state.items[0].attachment?.name).toBe("FILE-A")
        expect(state.items[0].status).toBe("uploaded")
        expect(state.items[1].error).toBeUndefined()
        expect(() => taskUploadReducer(state, { type: "created", task: "TASK-2026-00002" })).toThrow()
    })

    it("prevents uploads before creation and duplicate starts after completion", () => {
        let state = taskUploadReducer(empty(), { type: "add", items: [{ id: "a", file: file("screen.png") }] })
        expect(() => taskUploadReducer(state, { type: "start", id: "a" })).toThrow()
        state = taskUploadReducer(state, { type: "created", task: "TASK-2026-00001" })
        state = taskUploadReducer(state, { type: "start", id: "a" })
        const inFlight = state
        expect(taskUploadReducer(state, { type: "start", id: "a" })).toBe(inFlight)
        expect(taskUploadReducer(state, { type: "remove", id: "a" })).toBe(inFlight)
        state = taskUploadReducer(state, { type: "uploaded", id: "a", attachment: { name: "FILE-A", file_url: "/private/files/screen.png", file_name: "screen.png" } })
        expect(taskUploadReducer(state, { type: "retry", id: "a" })).toBe(state)
        expect(taskUploadReducer(state, { type: "start", id: "a" })).toBe(state)
        expect(taskUploadReducer(state, { type: "remove", id: "a" })).toBe(state)
    })

    it("removes an unsubmitted selection without creating or deleting records", () => {
        const selected = taskUploadReducer(empty(), { type: "add", items: [{ id: "a", file: file("brief.pdf") }] })
        expect(taskUploadReducer(selected, { type: "remove", id: "a" })).toEqual({ task: null, items: [] })
        expect(selected.items[0].status).toBe("selected")
    })

    it("ignores late progress/failure after successful upload and clamps in-flight progress", () => {
        let state = taskUploadReducer({ task: "TASK-2026-00001", items: [] }, { type: "add", items: [{ id: "a", file: file("brief.pdf") }] })
        state = taskUploadReducer(state, { type: "start", id: "a" })
        state = taskUploadReducer(state, { type: "progress", id: "a", progress: 120 })
        expect(state.items[0].progress).toBe(100)
        state = taskUploadReducer(state, { type: "uploaded", id: "a", attachment: { name: "FILE-A", file_url: "/private/files/brief.pdf", file_name: "brief.pdf" } })
        expect(taskUploadReducer(state, { type: "failed", id: "a", error: "late error" })).toBe(state)
        expect(taskUploadReducer(state, { type: "progress", id: "a", progress: 10 })).toBe(state)
    })
})
