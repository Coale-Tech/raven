import { useState } from "react"
import { useFrappeGetCall, useFrappePostCall, type FrappeError } from "frappe-react-sdk"
import { NotepadTextIcon } from "lucide-react"
import { Button } from "@components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@components/ui/empty"
import ErrorBanner, { errorResponseToast } from "@components/ui/error-banner"
import { Textarea } from "@components/ui/textarea"
import { Spinner } from "@components/ui/spinner"
import { ServerHtml } from "@components/features/message/renderers/DocumentLinkRenderer"
import { formatRelativeDate } from "@lib/date"
import _ from "@lib/translate"

type ProjectNote = { name: string; content: string; owner: string; creation: string }

/** Project Hub → Notes: Comments on the Project, same timeline the Desk Project record shows. */
export default function NotesTab({ project }: { project: string }) {
    const { data, error, mutate } = useFrappeGetCall<{ message: ProjectNote[] }>(
        "raven.api.project_tabs.get_notes",
        { project },
        ["project_notes", project],
    )
    const notes = data?.message ?? []

    const { call: addNote, loading: adding } = useFrappePostCall("raven.api.project_tabs.add_note")
    const [content, setContent] = useState("")

    const submit = () => {
        if (!content.trim()) return
        addNote({ project, content })
            .then(() => {
                setContent("")
                mutate()
            })
            .catch((e: FrappeError) => errorResponseToast(_("Could not add note"), e))
    }

    if (!data && !error) {
        return (
            <div className="flex justify-center p-8">
                <Spinner />
            </div>
        )
    }
    if (error) return <ErrorBanner error={error} />

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
                <Textarea placeholder={_("Write a note…")} value={content} onChange={(e) => setContent(e.target.value)} />
                <Button className="self-end" onClick={submit} loading={adding} disabled={!content.trim()}>
                    {_("Add note")}
                </Button>
            </div>
            {notes.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyMedia>
                            <NotepadTextIcon />
                        </EmptyMedia>
                        <EmptyTitle>{_("No notes yet")}</EmptyTitle>
                        <EmptyDescription>{_("Notes added here also show on the Project's Desk timeline.")}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                <div className="flex flex-col gap-3">
                    {notes.map((note) => (
                        <div key={note.name} className="rounded-md border border-outline-gray-2 p-3">
                            <ServerHtml html={note.content} className="text-sm text-ink-gray-8" />
                            <div className="mt-2 text-xs text-ink-gray-5">
                                {note.owner} · {formatRelativeDate(note.creation)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
