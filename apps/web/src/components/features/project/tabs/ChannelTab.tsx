import { ChatContentView } from "@components/features/message/ChatContentView"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@components/ui/empty"
import { MessageSquare } from "lucide-react"
import _ from "@lib/translate"

/** Project Hub → Channel: the Project's linked Raven Channel, embedded inline (messages + composer). */
export default function ChannelTab({ channel }: { channel: string | null }) {
    if (!channel) {
        return (
            <Empty>
                <EmptyHeader>
                    <EmptyMedia>
                        <MessageSquare />
                    </EmptyMedia>
                    <EmptyTitle>{_("No channel linked")}</EmptyTitle>
                    <EmptyDescription>
                        {_("Link this project to a Raven Channel from the channel's menu to chat here.")}
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        )
    }

    return <ChatContentView channelID={channel} />
}
