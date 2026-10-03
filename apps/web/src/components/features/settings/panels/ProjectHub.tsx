import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@components/ui/table"
import type { RavenProjectTypeWorkspace } from "@raven/types/Raven/RavenProjectTypeWorkspace"
import { Separator } from "@components/ui/separator"
import { DataField, LinkFormField, SelectFormField, SwitchFormField } from "@components/ui/form-elements"
import { SelectItem } from "@components/ui/select"
import { AdminSettingsForm } from "./AdminSettingsForm"
import type { RavenSettings } from "@raven/types/Raven/RavenSettings"
import _ from "@lib/translate"

const FORM_ID = "settings-project-hub-form"

/** Which workspace handles each Project Type (e.g. Finance vs Systems). */
const ProjectTypeWorkspaces = () => {
    const { control, formState } = useFormContext<RavenSettings>()
    const { fields, append, remove } = useFieldArray({ control, name: "project_type_workspaces" })

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                <span className="text-base-medium text-ink-gray-8">{_("Choose workspaces based on Project Type")}</span>
                <Button
                    type="button" variant="outline" size="sm" disabled={formState.disabled}
                    onClick={() => append({ project_type: "", raven_workspace: "" } as RavenProjectTypeWorkspace)}
                >
                    <PlusIcon />
                    {_("Add")}
                </Button>
            </div>
            {fields.length > 0 && (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{_("Project Type")}</TableHead>
                            <TableHead>{_("Workspace")}</TableHead>
                            <TableHead className="w-12" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {fields.map((row, index) => (
                            <TableRow key={row.id}>
                                <TableCell>
                                    <LinkFormField
                                        name={`project_type_workspaces.${index}.project_type`}
                                        label={_("Project Type in Row {0}", [String(index + 1)])}
                                        hideLabel
                                        doctype="Project Type"
                                        rules={{ required: _("Project Type is required") }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <LinkFormField
                                        name={`project_type_workspaces.${index}.raven_workspace`}
                                        label={_("Workspace in Row {0}", [String(index + 1)])}
                                        hideLabel
                                        doctype="Raven Workspace"
                                        rules={{ required: _("Workspace is required") }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Button
                                        type="button" variant="ghost" theme="red" size="sm" isIconButton
                                        aria-label={_("Remove mapping")} disabled={formState.disabled}
                                        onClick={() => remove(index)}
                                    >
                                        <Trash2Icon />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    )
}

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
                                label={_("Default Project Workspace")}
                                doctype="Raven Workspace"
                                isRequired
                                rules={{ required: _("Project workspace is required") }}
                                formDescription={_("Used for Projects whose type has no workspace below.")}
                            />
                            <ProjectTypeWorkspaces />
                        </>
                    ) : null}

                    <Separator />

                    <DataField
                        name="github_token"
                        label={_("GitHub Token")}
                        formDescription={_("Fine-grained token with read access to Contents and Metadata, used to show a Project's changelog.")}
                        inputProps={{ type: "password", placeholder: "••••••••••••••••••••", autoComplete: "off" }}
                    />

                    <SwitchFormField
                        name="suggest_from_channels"
                        label={_("Suggest from project channel messages")}
                        formDescription={_("Also let AI read what your team writes in project channels. Costs one AI read per message and counts toward the daily limit. Needs AI Integration enabled.")}
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
