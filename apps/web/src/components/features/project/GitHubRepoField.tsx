import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk"
import { XIcon } from "lucide-react"
import { Badge } from "@components/ui/badge"
import { FilterCombobox, FilterComboboxItem } from "@components/common/filters/FilterCombobox"
import _ from "@lib/translate"

type AvailableRepo = { full_name: string; private: boolean }

/**
 * Multi-repo picker for the Project side panel's GitHub Repositories row. Lists
 * repos the site's GitHub token (Raven Settings) can see, lets the user add any
 * number of them, and shows the ones already linked as removable chips.
 *
 * FilterCombobox's `close` is deliberately never called from onSelect: closing on
 * every pick would force reopening the popover for each repo. Instead the picked
 * repo drops out of `available` (it's already in `repos`) on the next render.
 */
export default function GitHubRepoField({
    project,
    repos,
    onChange,
}: {
    project: string
    repos: string[]
    onChange: () => void
}) {
    const { data, error } = useFrappeGetCall<{ message: AvailableRepo[] }>(
        "raven.api.project_hub.list_available_github_repos",
        undefined,
        "github_available_repos",
        { revalidateOnFocus: false },
    )
    const { call: addRepo } = useFrappePostCall("raven.api.project_hub.add_project_repo")
    const { call: removeRepo } = useFrappePostCall("raven.api.project_hub.remove_project_repo")

    const available = (data?.message ?? []).filter((repo) => !repos.includes(repo.full_name))

    return (
        <div className="flex flex-col gap-1.5">
            {repos.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {repos.map((repo) => (
                        <Badge key={repo} variant="outline" className="gap-1 pr-1">
                            {repo}
                            <button
                                type="button"
                                aria-label={_("Remove {0}", [repo])}
                                onClick={() => removeRepo({ project, repository: repo }).then(() => onChange())}
                                className="rounded-full hover:bg-surface-gray-3"
                            >
                                <XIcon className="size-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
            {error ? (
                <a href="/app/raven-settings" target="_blank" rel="noreferrer" className="text-sm text-ink-blue-6 hover:underline">
                    {_("Set a GitHub token in Settings to add repositories")}
                </a>
            ) : (
                <FilterCombobox
                    trigger={<span className="text-sm text-ink-gray-6">{_("Add repository")}</span>}
                    emptyLabel={_("No repositories found")}
                    triggerClassName="h-7 w-full justify-start bg-transparent"
                >
                    {() =>
                        available.map((repo) => (
                            <FilterComboboxItem
                                key={repo.full_name}
                                value={repo.full_name}
                                selected={false}
                                onSelect={() => addRepo({ project, repository: repo.full_name }).then(() => onChange())}
                            >
                                {repo.full_name}
                            </FilterComboboxItem>
                        ))
                    }
                </FilterCombobox>
            )}
        </div>
    )
}
