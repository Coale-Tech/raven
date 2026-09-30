import { useRef, useState, type ChangeEvent } from "react"
import { useFrappeFileUpload, useFrappeGetCall, type FrappeError } from "frappe-react-sdk"
import { FileIcon, FolderIcon, HardDriveIcon, UploadIcon } from "lucide-react"
import { Button } from "@components/ui/button"
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

/**
 * Project Hub → Documents: the project's Suite Drive folder (a Drive team created with the Project;
 * its members are the project's users). Upload Excel/Word/PDF etc. here; click a file to view or
 * edit it in Suite.
 */
export default function DocumentsTab({ project }: { project: string }) {
    const { data, error, mutate } = useFrappeGetCall<{ message: DriveFolder }>(
        "raven.api.project_tabs.get_files",
        { project },
        ["project_files", project],
    )
    const { upload } = useFrappeFileUpload()
    const [uploading, setUploading] = useState(false)
    const picker = useRef<HTMLInputElement>(null)
    const drive = data?.message

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
            mutate()
        }
    }

    if (!data && !error) {
        return (
            <div className="flex justify-center py-8">
                <Spinner />
            </div>
        )
    }
    if (error) return <ErrorBanner error={error} />
    if (!drive) return null

    return (
        <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <h3 className="text-sm-medium text-ink-gray-7">{_("Files")}</h3>
                {drive.folder && (
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
                                <Button size="sm" onClick={() => picker.current?.click()} loading={uploading}>
                                    <UploadIcon />
                                    {_("Add files")}
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </div>
            {!drive.folder ? (
                <p className="text-sm text-ink-gray-5">{_("This project's Drive folder is created the next time the project is saved.")}</p>
            ) : drive.files === null ? (
                <p className="text-sm text-ink-gray-5">{_("You don't have access to this project's Drive folder. Ask to be added as a project user.")}</p>
            ) : drive.files.length === 0 ? (
                <p className="text-sm text-ink-gray-5">{_("No files yet. Add Excel, Word, PDF or any other files.")}</p>
            ) : (
                <div className="divide-y divide-outline-gray-2 rounded-md border border-outline-gray-2">
                    {drive.files.map((file) => (
                        <div key={file.name} className="flex items-center gap-2 px-3 py-2">
                            {file.is_folder ? <FolderIcon className="size-4 shrink-0" /> : <FileIcon className="size-4 shrink-0" />}
                            <a
                                href={`/drive/g/${file.name}`}
                                target="_blank"
                                rel="noreferrer"
                                className="min-w-0 flex-1 truncate text-sm text-ink-blue-6 hover:underline"
                            >
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
    )
}
