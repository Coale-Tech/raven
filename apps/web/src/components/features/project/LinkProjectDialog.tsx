import { useState } from "react"
import { useFrappePostCall, useSWRConfig, type FrappeError } from "frappe-react-sdk"
import { toast } from "sonner"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@components/ui/dialog"
import { Button } from "@components/ui/button"
import { Checkbox } from "@components/ui/checkbox"
import { Label } from "@components/ui/label"
import LinkFieldCombobox from "@components/common/LinkFieldComboBox/LinkFieldCombobox"
import { errorResponseToast } from "@components/ui/error-banner"
import _ from "@lib/translate"

interface LinkProjectDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    channelID: string
    /** Undefined when the channel's workspace isn't known — the whole-workspace option is disabled then. */
    workspaceID?: string
}

/**
 * Links this channel — or its whole workspace — to an ERPNext Project, so the
 * channel picks up the Project Hub button. Mirrors GroupNameDialog's shape:
 * gated on `open` so the form starts fresh every time it's reopened.
 */
const LinkProjectDialog = ({ open, onOpenChange, channelID, workspaceID }: LinkProjectDialogProps) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[420px]">
            {open && (
                <LinkProjectForm
                    channelID={channelID}
                    workspaceID={workspaceID}
                    close={() => onOpenChange(false)}
                />
            )}
        </DialogContent>
    </Dialog>
)

const LinkProjectForm = ({
    channelID, workspaceID, close,
}: { channelID: string; workspaceID?: string; close: () => void }) => {
    const [project, setProject] = useState("")
    const [wholeWorkspace, setWholeWorkspace] = useState(false)
    const { mutate } = useSWRConfig()
    const { call, loading } = useFrappePostCall("raven.api.project_hub.link_project")

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!project) return
        call(wholeWorkspace ? { project, workspace: workspaceID } : { project, channel_id: channelID })
            .then(() => {
                mutate(["project_for_channel", channelID])
                toast(_("Project linked"))
                close()
            })
            .catch((error) => errorResponseToast(_("Could not link project"), error as FrappeError))
    }

    return (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <DialogHeader>
                <DialogTitle>{_("Link Project")}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
                <Label>{_("Project")}</Label>
                <LinkFieldCombobox doctype="Project" value={project} onChange={setProject} />
            </div>
            <Label className="flex items-center gap-2">
                <Checkbox
                    checked={wholeWorkspace}
                    onCheckedChange={(v) => setWholeWorkspace(v === true)}
                    disabled={!workspaceID}
                />
                {_("Link to the whole workspace")}
            </Label>
            <DialogFooter>
                <DialogClose asChild>
                    <Button size="md" type="button" variant="outline">{_("Cancel")}</Button>
                </DialogClose>
                <Button size="md" type="submit" disabled={!project || loading}>
                    {_("Link")}
                </Button>
            </DialogFooter>
        </form>
    )
}

export default LinkProjectDialog
