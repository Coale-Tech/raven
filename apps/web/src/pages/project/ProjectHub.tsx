import { useEffect, type ComponentType } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useFrappeGetCall } from "frappe-react-sdk"
import { useAtom } from "jotai"
import {
    ArrowUpRight,
    ChevronLeft,
    CircleAlert,
    GitBranch,
    ListChecks,
    Mail,
    NotepadText,
    PanelRight,
    Receipt,
    type LucideIcon,
} from "lucide-react"
import { PageHeader } from "@components/layout/PageHeader"
import { Button } from "@components/ui/button"
import { Badge } from "@components/ui/badge"
import { Skeleton } from "@components/ui/skeleton"
import ErrorBanner from "@components/ui/error-banner"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@components/ui/tabs"
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@components/ui/drawer"
import ProjectSidePanel from "@components/features/project/ProjectSidePanel"
import ProjectSidePanelContent from "@components/features/project/ProjectSidePanelContent"
import TasksTab from "@components/features/project/tabs/TasksTab"
import NotesTab from "@components/features/project/tabs/NotesTab"
import CommunicationTab from "@components/features/project/tabs/CommunicationTab"
import GitHubTab from "@components/features/project/tabs/GitHubTab"
import BillingTab from "@components/features/project/tabs/BillingTab"
import IssuesTab from "@components/features/project/tabs/IssuesTab"
import { projectPanelOpenAtom } from "@utils/projectAtoms"
import { useIsMobile } from "@hooks/use-mobile"
import _ from "@lib/translate"

export type ProjectSummary = {
    name: string
    project_name: string
    status: string
    percent_complete: number
    expected_start_date: string | null
    expected_end_date: string | null
    customer: string | null
    company: string | null
    raven_github_repo: string | null
    users: string[]
    channel: string | null
}

type TabKey = "tasks" | "notes" | "communication" | "github" | "billing" | "issues"

const LAST_TAB_KEY = "ravenLastProjectTab"

const TABS: { key: TabKey; label: string; icon: LucideIcon; panel: ComponentType<{ project: string }> }[] = [
    { key: "tasks", label: "Tasks", icon: ListChecks, panel: TasksTab },
    { key: "notes", label: "Notes", icon: NotepadText, panel: NotesTab },
    { key: "communication", label: "Communication", icon: Mail, panel: CommunicationTab },
    { key: "github", label: "GitHub", icon: GitBranch, panel: GitHubTab },
    { key: "billing", label: "Billing", icon: Receipt, panel: BillingTab },
    { key: "issues", label: "Issues", icon: CircleAlert, panel: IssuesTab },
]
const TAB_KEYS = TABS.map((t) => t.key)
const isTabKey = (v: string | null): v is TabKey => !!v && (TAB_KEYS as string[]).includes(v)

export default function ProjectHub() {
    const { projectID = "", workspaceID = "" } = useParams<{ projectID: string; workspaceID: string }>()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const channelID = searchParams.get("channel") || undefined
    const isMobile = useIsMobile()
    const [panelOpen, setPanelOpen] = useAtom(projectPanelOpenAtom)

    const urlTab = searchParams.get("tab")
    const storedTab = localStorage.getItem(LAST_TAB_KEY)
    const tab: TabKey = isTabKey(urlTab) ? urlTab : isTabKey(storedTab) ? storedTab : "tasks"

    // The URL is the source of truth for the shared/bookmarked link — a missing
    // or invalid `tab` param is normalized into the URL once, on landing.
    useEffect(() => {
        if (urlTab !== tab) setSearchParams({ tab, ...(channelID ? { channel: channelID } : {}) }, { replace: true })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const onTabChange = (next: string) => {
        setSearchParams({ tab: next, ...(channelID ? { channel: channelID } : {}) }, { replace: true })
        localStorage.setItem(LAST_TAB_KEY, next)
    }

    const { data, error, isLoading } = useFrappeGetCall<{ message: ProjectSummary }>(
        "raven.api.project_hub.get_project_summary",
        { project: projectID },
        ["project_summary", projectID],
    )
    const summary = data?.message

    const goBack = () => (channelID ? navigate(`/${workspaceID}/${channelID}`) : navigate(-1))

    return (
        <div className="flex flex-col h-dvh overflow-hidden">
            <PageHeader title={summary?.project_name ?? ""}>
                <Button variant="ghost" isIconButton className="-order-1" aria-label={_("Back")} onClick={goBack}>
                    <ChevronLeft />
                </Button>
                {summary && (
                    <Badge theme={summary.status === "Completed" ? "green" : summary.status === "Cancelled" ? "red" : "gray"}>
                        {_(summary.status)}
                    </Badge>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <Button variant="ghost" isIconButton aria-label={_("Toggle details panel")} onClick={() => setPanelOpen((v) => !v)}>
                        <PanelRight />
                    </Button>
                    <Button variant="ghost" isIconButton aria-label={_("Open in Desk")} onClick={() => window.open(`/app/project/${projectID}`, "_blank")}>
                        <ArrowUpRight />
                    </Button>
                </div>
            </PageHeader>

            <div className="flex flex-1 min-h-0 overflow-hidden">
                <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
                    {error ? (
                        <ErrorBanner className="m-5" error={error} overrideHeading={_("Could not load this project")} />
                    ) : isLoading || !summary ? (
                        <div className="flex flex-col gap-3 p-5">
                            <Skeleton className="h-6 w-48" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-2/3" />
                        </div>
                    ) : (
                        <Tabs value={tab} onValueChange={onTabChange} className="flex flex-1 min-h-0 flex-col">
                            <TabsList variant="underline" size="md" className="px-5 min-h-[45px] gap-7.5 shrink-0 overflow-x-auto [&::-webkit-scrollbar]:h-0">
                                {TABS.map(({ key, label, icon: Icon }) => (
                                    <TabsTrigger key={key} value={key}>
                                        <Icon />
                                        {_(label)}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                            {TABS.map(({ key, panel: Panel }) => (
                                <TabsContent key={key} value={key} className="flex-1 min-h-0 overflow-y-auto p-5">
                                    <Panel project={projectID} />
                                </TabsContent>
                            ))}
                        </Tabs>
                    )}
                </div>

                {summary && panelOpen && !isMobile && <ProjectSidePanel summary={summary} workspaceID={workspaceID} channelID={channelID} />}
            </div>

            {summary && isMobile && (
                <Drawer open={panelOpen} onOpenChange={setPanelOpen}>
                    <DrawerContent className="h-[85dvh] pb-0">
                        <DrawerTitle className="sr-only">{_("Project details")}</DrawerTitle>
                        <DrawerDescription className="sr-only">{_("Project status, dates and members")}</DrawerDescription>
                        <ProjectSidePanelContent summary={summary} workspaceID={workspaceID} channelID={channelID} />
                    </DrawerContent>
                </Drawer>
            )}
        </div>
    )
}
