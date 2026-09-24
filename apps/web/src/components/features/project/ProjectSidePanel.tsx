import { useRef, type PointerEvent } from "react"
import { useAtom } from "jotai"
import ProjectSidePanelContent from "./ProjectSidePanelContent"
import { projectPanelWidthAtom } from "@utils/projectAtoms"
import type { ProjectSummary } from "@pages/project/ProjectHub"

const MIN_WIDTH = 256
const MAX_WIDTH = 480

interface ProjectSidePanelProps {
    summary: ProjectSummary
    workspaceID: string
    channelID?: string
}

/**
 * The CRM Lead page's Resizer.vue, in React — there is no shared resizer
 * component in this codebase (Resizer.vue is Vue-only), so this is a small,
 * dependency-free pointer-drag implementation. Same clamp numbers as CRM:
 * min 16rem (256px), max 30rem (480px), default 352px.
 */
export default function ProjectSidePanel({ summary, workspaceID, channelID }: ProjectSidePanelProps) {
    const [width, setWidth] = useAtom(projectPanelWidthAtom)
    const handleRef = useRef<HTMLDivElement>(null)

    const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
        e.preventDefault()
        handleRef.current?.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
        if (!handleRef.current?.hasPointerCapture(e.pointerId)) return
        setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX)))
    }

    const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
        handleRef.current?.releasePointerCapture(e.pointerId)
    }

    return (
        <aside
            style={{ width }}
            className="relative shrink-0 border-l border-outline-gray-2 flex flex-col overflow-hidden"
        >
            <div
                ref={handleRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                className="absolute left-0 inset-y-0 z-10 w-1 cursor-col-resize hover:bg-surface-gray-3"
            />
            <ProjectSidePanelContent summary={summary} workspaceID={workspaceID} channelID={channelID} />
        </aside>
    )
}
