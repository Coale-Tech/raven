import { useRef, useState, type ChangeEvent } from "react"
import { useFrappeFileUpload, useFrappeGetCall, type FrappeError } from "frappe-react-sdk"
import { ChevronDownIcon, FilesIcon, FolderIcon, HardDriveIcon, PlusIcon, UploadIcon } from "lucide-react"
import { Badge } from "@components/ui/badge"
import { Button } from "@components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@components/ui/empty"
import ErrorBanner, { errorResponseToast } from "@components/ui/error-banner"
import { Spinner } from "@components/ui/spinner"
import { formatRelativeDate } from "@lib/date"
import { formatBytes } from "@raven/lib/utils/operations"
import _ from "@lib/translate"

type DriveFolder = {
    folder: string | null
    team: string | null
    files: { name: string; file_name: string; file_size: number; is_folder: number; modified: string }[] | null
    can_upload: boolean
}
type DocRow = { name: string; modified: string; docstatus: number; status?: string; [titleField: string]: unknown }
type DocGroup = { doctype: string; fieldname: string; title_field: string | null; has_status: boolean; rows: DocRow[] }
type Addable = { doctype: string; fieldname: string }

// Desk route slug: doctype lower-cased, spaces to dashes.
const slug = (doctype: string) => doctype.toLowerCase().replace(/ /g, "-")

/** Opens a Desk "new document" form with the project link pre-filled via route_options. */
const newDocUrl = ({ doctype, fieldname }: Addable, project: string) =>
    `/app/${slug(doctype)}/new?${new URLSearchParams({ [fieldname]: project })}`

/**
 * Project Hub → Documents: the project's Suite Drive folder (a Drive team created with the Project;
 * its members are the project's users) plus every ERPNext document linked to it, with a way to add either.
 */
export default function DocumentsTab({ project }: { project: string }) {
    const { data, error } = useFrappeGetCall<{ message: { groups: DocGroup[]; addable: Addable[] } }>(
        "raven.api.project_tabs.get_documents",
        { project },
        ["project_documents", project],
    )
    const { data: driveData, mutate: mutateFiles } = useFrappeGetCall<{ message: DriveFolder }>(
        "raven.api.project_tabs.get_files",
        { project },
        ["project_files", project],
    )
    const { upload } = useFrappeFileUpload()
    const [uploading, setUploading] = useState(false)
    const picker = useRef<HTMLInputElement>(null)
    const drive = driveData?.message

    const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
        const picked = Array.from(e.target.files ?? [])
        e.target.value = ""
        if (!drive?.folder) return
        setUploading(true)
        try {
            for (const file of picked) {
                await upload(
                    file,
                    {
                        otherData: {
                            team: drive.team ?? "",
                            parent: drive.folder,
                            total_file_size: file.size,
                            uuid: crypto.randomUUID(),
                            file_modified: file.lastModified,
                        },
                    },
                    "suite.drive.api.files.upload_file",
                )
            }
        } catch (err) {
            errorResponseToast(_("Could not upload file"), err as FrappeError)
        } finally {
            setUploading(false)
            mutateFiles()
        }
    }

    if (!data && !error) {
        return (
            <div className="flex justify-center p-8">
                <Spinner />
            </div>
        )
    }
    if (error) return <ErrorBanner error={error} />
    if (!data) return null

    const { groups, addable } = data.message
    const files = drive?.files ?? []

    return (
        <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm-medium text-ink-gray-7">{_("Files")}</h3>
                    {drive?.folder && (
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" asChild>
                                <a href={`/drive/d/${drive.folder}`} target="_blank" rel="noreferrer">
                                    <HardDriveIcon />
                                    {_("Open in Drive")}
                                </a>
                            </Button>
                            {drive.can_upload && (
                                <>
                                    <input ref={picker} type="file" multiple hidden onChange={onPick} />
                                    <Button variant="outline" size="sm" onClick={() => picker.current?.click()} loading={uploading}>
                                        <UploadIcon />
                                        {_("Upload")}
                                    </Button>
                                </>
                            )}
                        </div>
                    )}
                </div>
                {!drive ? null : !drive.folder ? (
                    <p className="text-sm text-ink-gray-5">{_("This project's Drive folder is created the next time the project is saved.")}</p>
                ) : drive.files === null ? (
                    <p className="text-sm text-ink-gray-5">{_("You don't have access to this project's Drive folder. Ask to be added as a project user.")}</p>
                ) : files.length === 0 ? (
                    <p className="text-sm text-ink-gray-5">{_("No files yet.")}</p>
                ) : (
                    <div className="divide-y divide-outline-gray-2 rounded-md border border-outline-gray-2">
                        {files.map((file) => (
                            <div key={file.name} className="flex items-center gap-2 px-3 py-2">
                                <a
                                    href={`/drive/g/${file.name}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="min-w-0 flex-1 truncate text-sm text-ink-blue-6 hover:underline"
                                >
                                    {file.is_folder ? <FolderIcon className="mr-1 inline size-4" /> : null}
                                    {file.file_name}
                                </a>
                                {!file.is_folder && (
                                    <span className="shrink-0 text-xs text-ink-gray-5">{formatBytes(file.file_size)}</span>
                                )}
                                <span className="shrink-0 text-xs text-ink-gray-5">{formatRelativeDate(file.modified)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm-medium text-ink-gray-7">{_("Linked documents")}</h3>
                    {addable.length > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <PlusIcon />
                                    {_("Add document")}
                                    <ChevronDownIcon />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                                {addable.map((a) => (
                                    <DropdownMenuItem key={a.doctype} onClick={() => window.open(newDocUrl(a, project), "_blank")}>
                                        {_(a.doctype)}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
                {groups.length === 0 ? (
                    <Empty>
                        <EmptyHeader>
                            <EmptyMedia>
                                <FilesIcon />
                            </EmptyMedia>
                            <EmptyTitle>{_("No linked documents yet")}</EmptyTitle>
                            <EmptyDescription>{_("Documents linked to this project will show up here.")}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    groups.map((group) => <DocumentGroup key={group.doctype} group={group} project={project} />)
                )}
            </section>
        </div>
    )
}

function DocumentGroup({ group, project }: { group: DocGroup; project: string }) {
    const { doctype, fieldname, title_field, has_status, rows } = group
    return (
        <Collapsible defaultOpen className="rounded-md border border-outline-gray-2">
            <div className="flex items-center gap-2 p-3">
                <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left">
                    <ChevronDownIcon className="size-4 shrink-0 text-ink-gray-5" />
                    <span className="text-sm-medium text-ink-gray-9">{_(doctype)}</span>
                    <Badge variant="subtle">{rows.length >= 50 ? "50+" : rows.length}</Badge>
                </CollapsibleTrigger>
                <a
                    href={`/app/${slug(doctype)}?${new URLSearchParams({ [fieldname]: project })}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs text-ink-blue-6 hover:underline"
                >
                    {_("View all")}
                </a>
            </div>
            <CollapsibleContent className="divide-y divide-outline-gray-2 border-t border-outline-gray-2">
                {rows.map((row) => (
                    <div key={row.name} className="flex items-center gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                            <a
                                href={`/app/${slug(doctype)}/${encodeURIComponent(row.name)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-ink-blue-6 hover:underline"
                            >
                                {row.name}
                            </a>
                            {title_field && row[title_field] ? (
                                <div className="truncate text-xs text-ink-gray-5">{String(row[title_field])}</div>
                            ) : null}
                        </div>
                        {has_status && row.status && <Badge variant="subtle">{_(row.status)}</Badge>}
                        <div className="shrink-0 text-xs text-ink-gray-5">{formatRelativeDate(row.modified)}</div>
                    </div>
                ))}
            </CollapsibleContent>
        </Collapsible>
    )
}
