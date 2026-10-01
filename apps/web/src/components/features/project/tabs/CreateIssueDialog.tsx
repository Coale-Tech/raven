import { useState, type FormEvent } from "react"
import { useFrappePostCall, type FrappeError } from "frappe-react-sdk"
import { Button } from "@components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@components/ui/dialog"
import { errorResponseToast } from "@components/ui/error-banner"
import { Input } from "@components/ui/input"
import { Label } from "@components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@components/ui/select"
import { Textarea } from "@components/ui/textarea"
import _ from "@lib/translate"

/** Project Hub → Issues: "New issue" modal. Creates an Issue linked to the project without leaving Raven. */
export default function CreateIssueDialog({
    project,
    priorities,
    issueTypes,
    open,
    onOpenChange,
    onCreated,
}: {
    project: string
    priorities: string[]
    issueTypes: string[]
    open: boolean
    onOpenChange: (open: boolean) => void
    onCreated: () => void
}) {
    const { call: createIssue, loading, reset } = useFrappePostCall<{ message: string }>(
        "raven.api.project_tabs.create_issue",
    )
    const defaultPriority = priorities.includes("Medium") ? "Medium" : (priorities[0] ?? "")
    const [subject, setSubject] = useState("")
    const [priority, setPriority] = useState(defaultPriority)
    const [issueType, setIssueType] = useState("")
    const [description, setDescription] = useState("")

    const handleOpenChange = (next: boolean) => {
        if (!next) {
            setSubject("")
            setPriority(defaultPriority)
            setIssueType("")
            setDescription("")
            reset()
        }
        onOpenChange(next)
    }

    const onSubmit = (e: FormEvent) => {
        e.preventDefault()
        if (!subject.trim()) return
        createIssue({
            project,
            subject: subject.trim(),
            priority: priority || undefined,
            issue_type: issueType || undefined,
            description: description.trim() || undefined,
        })
            .then(() => {
                onCreated()
                handleOpenChange(false)
            })
            .catch((err: FrappeError) => errorResponseToast(_("Could not create issue"), err))
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle>{_("New issue")}</DialogTitle>
                        <DialogDescription className="sr-only">{_("Create a support issue for this project.")}</DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="issue-subject">{_("Subject")}</Label>
                        <Input
                            id="issue-subject"
                            autoFocus
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder={_("What is the problem?")}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label>{_("Priority")}</Label>
                            <Select value={priority} onValueChange={setPriority}>
                                <SelectTrigger inputSize="md">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {priorities.map((p) => (
                                        <SelectItem key={p} value={p}>
                                            {_(p)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label>{_("Type")}</Label>
                            <Select value={issueType} onValueChange={setIssueType}>
                                <SelectTrigger inputSize="md">
                                    <SelectValue placeholder={_("Optional")} />
                                </SelectTrigger>
                                <SelectContent>
                                    {issueTypes.map((t) => (
                                        <SelectItem key={t} value={t}>
                                            {_(t)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="issue-description">{_("Details")}</Label>
                        <Textarea
                            id="issue-description"
                            rows={4}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={_("Optional details (Shift+Enter for a new line)")}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
                            {_("Cancel")}
                        </Button>
                        <Button type="submit" loading={loading} disabled={!subject.trim()}>
                            {_("Create issue")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
