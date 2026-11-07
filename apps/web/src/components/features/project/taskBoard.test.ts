import { describe, expect, it } from "vitest"
import { mergeTaskPage, taskDue, taskPermalink, type TaskPage, type TaskCardData } from "./taskBoard"

describe("site-time task warnings", () => {
    const now = "2026-11-07 10:00:00"
    const task = { status: "Open", is_template: 0, exp_end_date: "2026-11-07 00:00:00" }
    it("does not reinterpret legacy midnight as end of day", () => {
        expect(taskDue(task, now)).toBe("overdue")
        expect(taskDue({ ...task, exp_end_date: "2026-11-07 23:59:59" }, now)).toBe("soon")
    })
    it("warns through the second following site-calendar day, not 72 hours", () => {
        expect(taskDue({ ...task, exp_end_date: "2026-11-09 23:59:59" }, now)).toBe("soon")
        expect(taskDue({ ...task, exp_end_date: "2026-11-10 00:00:00" }, now)).toBeNull()
    })
    it("excludes terminal/template work but preserves a native Overdue flag without a date", () => {
        for (const status of ["Completed", "Cancelled", "Template"]) expect(taskDue({ ...task, status }, now)).toBeNull()
        expect(taskDue({ ...task, is_template: 1 }, now)).toBeNull()
        expect(taskDue({ ...task, status: "Overdue", exp_end_date: null }, now)).toBe("overdue")
    })
})

it("deduplicates lane paging without replacing another lane or reshuffling previous cards", () => {
    const card = (name: string) => ({ name } as TaskCardData)
    const base = { lanes: [{ key: "Open", items: [card("a"), card("b")], total: 4 }, { key: "Overdue", items: [card("c")], total: 1 }] } as TaskPage
    const next = { lanes: [{ key: "Open", items: [card("b"), card("d")], total: 4, has_more: false, next_start: null }] } as TaskPage
    const result = mergeTaskPage(base, next)
    expect(result.lanes[0].items.map(item => item.name)).toEqual(["a", "b", "d"])
    expect(result.lanes[1]).toEqual(base.lanes[1])
    expect(result.lanes[0].has_more).toBe(false)
})

it("merges encoded task links without dropping channel and board filters", () => {
    const url = new URL(taskPermalink("TASK /&?", "http://localhost/raven/ws/project/P?channel=C&task_q=report&tab=inbox"))
    expect(url.searchParams.get("task")).toBe("TASK /&?")
    expect(url.searchParams.get("tab")).toBe("tasks")
    expect(url.searchParams.get("channel")).toBe("C")
    expect(url.searchParams.get("task_q")).toBe("report")
})
