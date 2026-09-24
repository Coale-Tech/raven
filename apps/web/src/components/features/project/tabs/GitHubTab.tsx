import { useFrappeGetCall } from "frappe-react-sdk"
import { ExternalLinkIcon, GitBranchIcon } from "lucide-react"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@components/ui/empty"
import ErrorBanner from "@components/ui/error-banner"
import MarkdownRenderer from "@components/ui/markdown"
import { Spinner } from "@components/ui/spinner"
import { formatDate } from "@lib/date"
import _ from "@lib/translate"

type Release = { name: string; tag_name: string; published_at: string | null; html_url: string; body: string | null }
type Commit = { sha: string; message: string; author: string | null; date: string | null; html_url: string }
type Changelog = { repo: string; releases: Release[]; commits: Commit[] }

/** Project Hub → GitHub: releases + recent commits, one section per linked repo. */
export default function GitHubTab({ project }: { project: string }) {
    const { data, error } = useFrappeGetCall<{ message: Changelog[] }>(
        "raven.api.project_tabs.get_changelog",
        { project },
        ["project_changelog", project],
    )

    if (!data && !error) {
        return (
            <div className="flex justify-center p-8">
                <Spinner />
            </div>
        )
    }
    if (error) return <ErrorBanner error={error} />

    const changelogs = data?.message ?? []

    if (changelogs.length === 0) {
        return (
            <Empty>
                <EmptyHeader>
                    <EmptyMedia>
                        <GitBranchIcon />
                    </EmptyMedia>
                    <EmptyTitle>{_("No GitHub repositories linked")}</EmptyTitle>
                    <EmptyDescription>{_("Add a repository from the side panel to see its changelog.")}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                    <a
                        href={`/app/project/${encodeURIComponent(project)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-ink-blue-6 hover:underline"
                    >
                        {_("Open Project in Desk")}
                    </a>
                </EmptyContent>
            </Empty>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            {changelogs.map((changelog) => (
                <RepoChangelog key={changelog.repo} changelog={changelog} />
            ))}
        </div>
    )
}

/** One linked repo's releases + commits, so each application's history reads separately. */
function RepoChangelog({ changelog }: { changelog: Changelog }) {
    return (
        <div className="flex flex-col gap-4 rounded-lg border border-outline-gray-2 p-4">
            <a
                href={`https://github.com/${changelog.repo}`}
                target="_blank"
                rel="noreferrer"
                className="flex w-fit items-center gap-2 text-base-medium text-ink-gray-9 hover:underline"
            >
                <GitBranchIcon className="size-4" />
                {changelog.repo}
                <ExternalLinkIcon className="size-3.5 text-ink-gray-5" />
            </a>
            <section className="flex flex-col gap-3">
                <h3 className="text-sm-medium text-ink-gray-7">{_("Releases")}</h3>
                {changelog.releases.length === 0 ? (
                    <p className="text-sm text-ink-gray-5">{_("No releases yet.")}</p>
                ) : (
                    changelog.releases.map((release) => (
                        <div key={release.name} className="rounded-md border border-outline-gray-2 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <a
                                    href={release.html_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-ink-gray-9 hover:underline"
                                >
                                    {release.name || release.tag_name}
                                </a>
                                <div className="flex shrink-0 items-center gap-2 text-xs text-ink-gray-5">
                                    {release.published_at ? formatDate(release.published_at) : null}
                                    <ExternalLinkIcon className="size-3.5" />
                                </div>
                            </div>
                            {release.body ? (
                                <MarkdownRenderer content={release.body} className="mt-2 text-sm text-ink-gray-7" />
                            ) : null}
                        </div>
                    ))
                )}
            </section>
            <section className="flex flex-col gap-2">
                <h3 className="text-sm-medium text-ink-gray-7">{_("Commits")}</h3>
                {changelog.commits.length === 0 ? (
                    <p className="text-sm text-ink-gray-5">{_("No commits yet.")}</p>
                ) : (
                    <div className="flex flex-col divide-y divide-outline-gray-2 rounded-md border border-outline-gray-2">
                        {changelog.commits.map((commit) => (
                            <a
                                key={commit.sha}
                                href={commit.html_url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-3 p-2.5 hover:bg-surface-gray-2"
                            >
                                <code className="shrink-0 rounded bg-surface-gray-2 px-1.5 py-0.5 text-xs text-ink-gray-6">
                                    {commit.sha}
                                </code>
                                <span className="min-w-0 flex-1 truncate text-sm text-ink-gray-8">{commit.message}</span>
                                <span className="shrink-0 text-xs text-ink-gray-5">{commit.author}</span>
                                <span className="shrink-0 text-xs text-ink-gray-5">
                                    {commit.date ? formatDate(commit.date) : ""}
                                </span>
                            </a>
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}
