import { useFrappeGetCall } from "frappe-react-sdk"

/**
 * Project linked to a channel — directly, or through its workspace (the
 * channel link wins). `undefined` while loading, `null`/`undefined` when
 * unlinked or the caller can't read the project.
 */
export const useProjectForChannel = (channelID: string) => {
    const { data } = useFrappeGetCall<{ message: string | null }>(
        "raven.api.project_hub.get_project_for_channel",
        { channel_id: channelID },
        ["project_for_channel", channelID],
        { revalidateOnFocus: false },
    )
    return data?.message
}
