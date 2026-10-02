
export interface RavenProjectTypeWorkspace{
	creation: string
	name: string
	modified: string
	owner: string
	modified_by: string
	docstatus: 0 | 1 | 2
	parent?: string
	parentfield?: string
	parenttype?: string
	idx?: number
	/**	Project Type : Link - Project Type	*/
	project_type: string
	/**	Raven Workspace : Link - Raven Workspace	*/
	raven_workspace: string
}
