import { useFormContext, useWatch } from "react-hook-form"
import { Separator } from "@components/ui/separator"
import { DataField, LinkFormField, SelectFormField, SwitchFormField } from "@components/ui/form-elements"
import { SelectItem } from "@components/ui/select"
import { AdminSettingsForm } from "./AdminSettingsForm"
import type { RavenSettings } from "@raven/types/Raven/RavenSettings"
import _ from "@lib/translate"

const FORM_ID = "settings-project-hub-form"

/** Own component, not a render prop — see AdminSettingsForm. */
const ProjectHubFields = () => {
    const { control } = useFormContext<RavenSettings>()
    const hubEnabled = useWatch({ control, name: "enable_project_hub" })
    const autoCreate = useWatch({ control, name: "auto_create_project_channel" })

    return (
        <>
            <SwitchFormField
                name="enable_project_hub"
                label={_("Enable Project Hub")}
                formDescription={_("Manage ERPNext Projects and Tasks from inside Raven.")}
            />

            {hubEnabled ? (
                <>
                    <Separator />

                    <SwitchFormField
                        name="auto_create_project_channel"
                        label={_("Create a channel for each Project")}
                        formDescription={_("A channel is created per Project and Project Users are synced as members.")}
                    />
                    {autoCreate ? (
                        <>
                            <SelectFormField
                                name="project_channel_type"
                                label={_("Project channel type")}
                            >
                                <SelectItem value="Public">{_("Public")}</SelectItem>
                                <SelectItem value="Private">{_("Private")}</SelectItem>
                            </SelectFormField>
                            <LinkFormField
                                name="project_workspace"
                                label={_("Project Workspace")}
                                doctype="Raven Workspace"
                                isRequired
                                rules={{ required: _("Project workspace is required") }}
                                formDescription={_("The channel for each new Project is created inside this workspace.")}
                            />
                        </>
                    ) : null}

                    <Separator />

                    <DataField
                        name="github_token"
                        label={_("GitHub Token")}
                        formDescription={_("Fine-grained token with read access to Contents and Metadata, used to show a Project's changelog.")}
                        inputProps={{ type: "password", placeholder: "••••••••••••••••••••", autoComplete: "off" }}
                    />
                </>
            ) : null}
        </>
    )
}

/** Project Hub — sync ERPNext Projects and Tasks with Raven channels and workspaces. */
export const ProjectHub = () => (
    <AdminSettingsForm
        title={_("Project Hub")}
        description={_("Manage ERPNext Projects and Tasks from inside Raven.")}
        formId={FORM_ID}
    >
        <ProjectHubFields />
    </AdminSettingsForm>
)

export default ProjectHub
