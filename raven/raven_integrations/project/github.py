import re

import frappe
import requests
from frappe import _

REPO_PATTERN = re.compile(r"[\w.-]+/[\w.-]+")
CACHE_TTL = 600


def fetch_changelog(repo: str) -> dict:
	"""Releases + recent commits for owner/repo, cached for 10 minutes."""
	if not REPO_PATTERN.fullmatch(repo):
		frappe.throw(_("Invalid GitHub repository"))

	cache_key = f"raven:github_changelog:{repo}"
	cached = frappe.cache().get_value(cache_key)
	if cached is not None:
		return cached

	headers = {
		"Accept": "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	}
	token = frappe.get_single("Raven Settings").get_password("github_token", raise_exception=False)
	if token:
		headers["Authorization"] = f"Bearer {token}"

	releases = _get(f"https://api.github.com/repos/{repo}/releases?per_page=20", headers, repo)
	commits = _get(f"https://api.github.com/repos/{repo}/commits?per_page=30", headers, repo)

	result = {
		"repo": repo,
		"releases": [
			{
				"name": r.get("name") or r.get("tag_name"),
				"tag_name": r.get("tag_name"),
				"published_at": r.get("published_at"),
				"html_url": r.get("html_url"),
				"body": r.get("body"),
			}
			for r in releases
		],
		"commits": [
			{
				"sha": c["sha"][:7],
				"message": c["commit"]["message"].splitlines()[0],
				"author": c["commit"]["author"]["name"],
				"date": c["commit"]["author"]["date"],
				"html_url": c["html_url"],
			}
			for c in commits
		],
	}

	frappe.cache().set_value(cache_key, result, expires_in_sec=CACHE_TTL)
	return result


def list_available_repos() -> list[dict]:
	"""Repositories the configured GitHub token can access, for the repo picker.

	Cached separately from fetch_changelog: this is one org-wide list (all repos
	the token sees), not per-repo changelog data.
	"""
	token = frappe.get_single("Raven Settings").get_password("github_token", raise_exception=False)
	if not token:
		frappe.throw(_("Set a GitHub token in Raven Settings to browse repositories"))

	cache_key = "raven:github_available_repos"
	cached = frappe.cache().get_value(cache_key)
	if cached is not None:
		return cached

	headers = {
		"Accept": "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"Authorization": f"Bearer {token}",
	}
	repos = _get(
		"https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
		headers,
		"user/repos",
	)
	result = [{"full_name": r["full_name"], "private": r["private"]} for r in repos]
	frappe.cache().set_value(cache_key, result, expires_in_sec=CACHE_TTL)
	return result


def _get(url: str, headers: dict, repo: str) -> list:
	response = requests.get(url, headers=headers, timeout=15)
	if response.status_code != 200:
		frappe.throw(_("GitHub returned {0} for {1}").format(response.status_code, repo))
	return response.json()
