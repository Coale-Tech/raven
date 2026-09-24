import { useMemo, useState } from "react"
import { useFrappeGetCall } from "frappe-react-sdk"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { FolderKanban, Plus } from "lucide-react"
import { PageHeader } from "@components/layout/PageHeader"
import AppMobileFooter from "@components/features/header/AppMobileFooter"
import { Badge } from "@components/ui/badge"
import { Button } from "@components/ui/button"
import { Progress } from "@components/ui/progress"
import { Skeleton } from "@components/ui/skeleton"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@components/ui/empty"
import ErrorBanner from "@components/ui/error-banner"
import { ListView, type ListViewColumnMeta } from "@components/ui/list-view"
import CreateProjectDialog from "@components/features/project/CreateProjectDialog"
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
    const [createOpen, setCreateOpen] = useState(false)

    const { data, error, isLoading, mutate } = useFrappeGetCall<{ message: ProjectRow[] }>(
        "raven.api.project_hub.list_my_projects",
        undefined,
        "my_projects_list",
        { revalidateOnFocus: false },
    )
    const projects = data?.message ?? []

    const handleProjectCreated = (project: string) => {
        mutate()
        openProject({ name: project, project_name: project, status: "Open", percent_complete: 0, channel: null, workspace: null })
    }

    const stats = useMemo(
        () => [
            { label: _("Total"), value: projects.length },
            { label: _("Open"), value: projects.filter((p) => p.status === "Open").length },
            { label: _("Completed"), value: projects.filter((p) => p.status === "Completed").length },
            { label: _("Cancelled"), value: projects.filter((p) => p.status === "Cancelled").length },
        ],
        [projects],
    )

    const openProject = (project: ProjectRow) => {
        const workspace = project.workspace || fallbackWorkspace
        if (!workspace) return
        const query = project.channel ? `?channel=${encodeURIComponent(project.channel)}` : ""
        navigate(`/${workspace}/project/${encodeURIComponent(project.name)}${query}`)
    }

    const columns = useMemo<ColumnDef<ProjectRow>[]>(
        () => [
            {
                id: "project_name",
                accessorKey: "project_name",
                header: _("Project"),
                meta: { gridWidth: "minmax(0,2fr)" } satisfies ListViewColumnMeta,
                cell: ({ row }) => (
                    <span className="truncate font-medium text-ink-gray-9">{row.original.project_name}</span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: _("Status"),
                meta: { gridWidth: "minmax(0,0.8fr)" } satisfies ListViewColumnMeta,
                cell: ({ row }) => (
                    <Badge theme={statusTheme(row.original.status)}>{_(row.original.status)}</Badge>
                ),
            },
            {
                id: "percent_complete",
                accessorKey: "percent_complete",
                header: _("Progress"),
                meta: { gridWidth: "minmax(0,1.4fr)" } satisfies ListViewColumnMeta,
                cell: ({ row }) => (
                    <div className="flex w-full items-center gap-2">
                        <Progress value={row.original.percent_complete} className="flex-1" />
                        <span className="text-sm text-ink-gray-6 tabular-nums">
                            {Math.round(row.original.percent_complete || 0)}%
                        </span>
                    </div>
                ),
            },
        ],
        [],
    )

    return (
        <div className="flex flex-col h-dvh overflow-hidden">
            <PageHeader title={_("Projects")}>
                <div className="ml-auto">
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus />
                        {_("New Project")}
                    </Button>
                </div>
            </PageHeader>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-4">
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
                    <>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {stats.map((stat) => (
                                <div key={stat.label} className="rounded-md border border-outline-gray-2 p-3">
                                    <div className="text-xs text-ink-gray-5">{stat.label}</div>
                                    <div className="mt-1 text-lg-medium text-ink-gray-9 tabular-nums">{stat.value}</div>
                                </div>
                            ))}
                        </div>
                        <ListView
                            data={projects}
                            columns={columns}
                            getRowId={(row) => row.name}
                            onRowClick={(row) => openProject(row)}
                            maxHeight="100%"
                            rowHeight={48}
                            className="flex-1 min-h-0"
                        />
                    </>
                )}
            </div>
            <AppMobileFooter />
            <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={handleProjectCreated} />
        </div>
    )
}

export default Projects
