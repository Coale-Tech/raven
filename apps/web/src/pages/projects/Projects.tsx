import { useFrappeGetCall } from "frappe-react-sdk"
import { useNavigate } from "react-router-dom"
import { FolderKanban } from "lucide-react"
import { PageHeader } from "@components/layout/PageHeader"
import AppMobileFooter from "@components/features/header/AppMobileFooter"
import { Badge } from "@components/ui/badge"
import { Progress } from "@components/ui/progress"
import { Skeleton } from "@components/ui/skeleton"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@components/ui/empty"
import ErrorBanner from "@components/ui/error-banner"
import { useWorkspaces } from "@hooks/useWorkspaces"
import _ from "@lib/translate"

type ProjectRow = {
    name: string
    project_name: string
    status: string
    percent_complete: number
    channel: string | null
    workspace: string | null
}

const statusTheme = (status: string) =>
    status === "Completed" ? "green" : status === "Cancelled" ? "red" : "gray"

/**
 * Global "Projects" list — the sidebar rail's entry point into the Project Hub
 * (mirrors Threads/Later), since a Project isn't scoped to one workspace the
 * way a channel is. Rows resolve their own workspace (via the linked channel)
 * to land on `/:workspaceID/project/:projectID`; a project with no linked
 * channel falls back to the user's first workspace, same as any other
 * workspace-chrome-only navigation in the app.
 */
const Projects = () => {
    const navigate = useNavigate()
    const { workspaces } = useWorkspaces()
    const fallbackWorkspace = workspaces[0]?.name

    const { data, error, isLoading } = useFrappeGetCall<{ message: ProjectRow[] }>(
        "raven.api.project_hub.list_my_projects",
        undefined,
        "my_projects_list",
        { revalidateOnFocus: false },
    )
    const projects = data?.message ?? []

    const openProject = (project: ProjectRow) => {
        const workspace = project.workspace || fallbackWorkspace
        if (!workspace) return
        const query = project.channel ? `?channel=${encodeURIComponent(project.channel)}` : ""
        navigate(`/${workspace}/project/${encodeURIComponent(project.name)}${query}`)
    }

    return (
        <div className="flex flex-col h-dvh overflow-hidden">
            <PageHeader title={_("Projects")} />
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
                {error ? (
                    <ErrorBanner error={error} overrideHeading={_("Could not load projects")} />
                ) : isLoading ? (
                    <div className="flex flex-col gap-2">
                        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                    </div>
                ) : projects.length === 0 ? (
                    <Empty>
                        <EmptyHeader>
                            <EmptyMedia><FolderKanban /></EmptyMedia>
                            <EmptyTitle>{_("No projects yet")}</EmptyTitle>
                            <EmptyDescription>
                                {_("Link a Project to a channel or workspace to see it here.")}
                            </EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    <div className="flex flex-col gap-2">
                        {projects.map((project) => (
                            <button
                                key={project.name}
                                type="button"
                                onClick={() => openProject(project)}
                                className="flex flex-col gap-2 rounded-lg border border-outline-gray-2 p-3 text-start hover:bg-surface-gray-2"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-base-medium text-ink-gray-9 truncate">{project.project_name}</span>
                                    <Badge theme={statusTheme(project.status)}>{_(project.status)}</Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Progress value={project.percent_complete} className="flex-1" />
                                    <span className="text-sm text-ink-gray-6">{Math.round(project.percent_complete || 0)}%</span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <AppMobileFooter />
        </div>
    )
}

export default Projects
