import { atomWithStorage } from "jotai/utils"

/**
 * Project Hub side panel UI state — width, open/closed, and which
 * collapsible sections are expanded. Persisted the same way as
 * lastVisitedAtoms: atomWithStorage + getOnInit so a reload restores state
 * instead of a stale module-scope read.
 */
export const projectPanelWidthAtom = atomWithStorage<number>("ravenProjectPanelWidth", 352, undefined, {
    getOnInit: true,
})

export const projectPanelOpenAtom = atomWithStorage<boolean>("ravenProjectPanelOpen", true, undefined, {
    getOnInit: true,
})

export type ProjectPanelSections = {
    details: boolean
    billing: boolean
    members: boolean
}

export const projectPanelSectionsAtom = atomWithStorage<ProjectPanelSections>(
    "ravenProjectPanelSections",
    { details: true, billing: true, members: true },
    undefined,
    { getOnInit: true },
)
