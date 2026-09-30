import { useFrappePostCall, useSWRConfig, type FrappeError } from "frappe-react-sdk"
import { useParams } from "react-router-dom"
import { ChatContentView } from "@components/features/message/ChatContentView"
import { Button } from "@components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@components/ui/empty"
import { errorResponseToast } from "@components/ui/error-banner"
import { MessageSquare } from "lucide-react"
import _ from "@lib/translate"

/** Project Hub → Channel: the Project's linked Raven Channel, embedded inline (messages + composer). */
export default function ChannelTab({ project, channel }: { project: string; channel: string | null }) {
    const { workspaceID = "" } = useParams<{ workspaceID: string }>()
    const { mutate } = useSWRConfig()
    const { call: createChannel, loading } = useFrappePostCall("raven.api.project_hub.create_channel_for_project")

    if (!channel) {
        return (
            <Empty>
                <EmptyHeader>
                    <EmptyMedia>
                        <MessageSquare />
                    </EmptyMedia>
                    <EmptyTitle>{_("No channel linked")}</EmptyTitle>
                    <EmptyDescription>
                        {_("Create a channel for this project, or link an existing one from the channel's menu.")}
                    </EmptyDescription>
                </EmptyHeader>
                <Button
                    loading={loading}
                    onClick={() =>
                        createChannel({ project, workspace: workspaceID })
                            .then(() => mutate(["project_summary", project]))
                            .catch((err: FrappeError) => errorResponseToast(_("Could not create channel"), err))
                    }
                >
                    {_("Create channel")}
                </Button>
            </Empty>
        )
    }

    return <ChatContentView channelID={channel} />
}
