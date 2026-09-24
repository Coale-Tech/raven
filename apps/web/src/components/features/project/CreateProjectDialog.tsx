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
import LinkFieldCombobox from "@components/common/LinkFieldComboBox/LinkFieldCombobox"
import { getSystemDefault, getUserDefault } from "@lib/frappe"
import _ from "@lib/translate"

/**
 * Projects list → "New Project" dialog. Mirrors `CreateTaskDialog`: labeled
 * fields, Enter submits, Escape/overlay-click cancels via Dialog defaults.
 */
export default function CreateProjectDialog({
    open,
    onOpenChange,
    onCreated,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCreated: (project: string) => void
}) {
    const { call: createProject, loading, reset } = useFrappePostCall<{ message: string }>(
        "raven.api.project_hub.create_project",
    )
    const [projectName, setProjectName] = useState("")
    const [company, setCompany] = useState(() => getUserDefault("company", getSystemDefault("company", "")) ?? "")
    const [customer, setCustomer] = useState("")
    const [endDate, setEndDate] = useState("")

    const resetForm = () => {
        setProjectName("")
        setCompany(getUserDefault("company", getSystemDefault("company", "")) ?? "")
        setCustomer("")
        setEndDate("")
        reset()
    }

    const handleOpenChange = (next: boolean) => {
        if (!next) resetForm()
        onOpenChange(next)
    }

    const onSubmit = (e: FormEvent) => {
        e.preventDefault()
        if (!projectName.trim() || !company) return
        createProject({
            project_name: projectName.trim(),
            company,
            customer: customer || undefined,
            expected_end_date: endDate || undefined,
        })
            .then((res) => {
                onCreated(res.message)
                handleOpenChange(false)
            })
            .catch((err: FrappeError) => errorResponseToast(_("Could not create project"), err))
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle>{_("New project")}</DialogTitle>
                        <DialogDescription className="sr-only">
                            {_("Create a Project and its channel.")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="project-name">{_("Project name")}</Label>
                        <Input
                            id="project-name"
                            autoFocus
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            placeholder={_("e.g. Website Redesign")}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label>{_("Company")}</Label>
                        <LinkFieldCombobox doctype="Company" value={company} onChange={setCompany} />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label>{_("Customer")}</Label>
                        <LinkFieldCombobox doctype="Customer" value={customer} onChange={setCustomer} clearable />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="project-end-date">{_("Expected end date")}</Label>
                        <Input
                            id="project-end-date"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
                            {_("Cancel")}
                        </Button>
                        <Button type="submit" loading={loading} disabled={!projectName.trim() || !company}>
                            {_("Create project")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
