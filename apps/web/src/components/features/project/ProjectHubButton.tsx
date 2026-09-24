import { FolderKanban } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "@components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@components/ui/tooltip"
import { useChannel } from "@hooks/useChannel"
import { useIsMobile } from "@hooks/use-mobile"
import { useProjectForChannel } from "@hooks/useProjectForChannel"
import _ from "@lib/translate"

/**
 * Entry point into the Project Hub from a channel that's linked to a Project
 * (directly, or through its workspace). Renders nothing when there's no
 * link — same "only show what's there" rule ChannelMembers/pins follow.
 */
const ProjectHubButton = ({ channelID }: { channelID: string }) => {
    const navigate = useNavigate()
    const isMobile = useIsMobile()
    const { channel } = useChannel(channelID)
    const project = useProjectForChannel(channelID)

    if (!project || !channel?.workspace) return null

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size={isMobile ? "md" : "sm"}
                    isIconButton
                    onClick={() => navigate(`/${channel.workspace}/project/${encodeURIComponent(project)}?channel=${channelID}`)}
                    aria-label={_("Project")}
                >
                    <FolderKanban className="size-4.5 md:size-4" />
                </Button>
            </TooltipTrigger>
            <TooltipContent>{_("Project")}</TooltipContent>
        </Tooltip>
    )
}

export default ProjectHubButton
