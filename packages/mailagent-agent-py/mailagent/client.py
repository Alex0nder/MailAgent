"""HTTP client for MailAgent REST API (parity with @mailagent/agent core flows)."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Mapping, MutableMapping, Optional


class MailAgentError(RuntimeError):
    def __init__(self, status: int, body: Any):
        super().__init__(f"MailAgent {status}: {json.dumps(body)}")
        self.status = status
        self.body = body


class MailAgent:
    def __init__(self, base_url: str, api_key: str):
        self.base = base_url.rstrip("/")
        self.api_key = api_key

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[Mapping[str, Any]] = None,
        *,
        accept: str = "application/json",
    ) -> Any:
        data = None
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": accept,
        }
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(
            f"{self.base}{path}",
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                text = res.read().decode("utf-8")
                return json.loads(text) if text else {}
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8")
            try:
                parsed = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                parsed = {"raw": raw}
            raise MailAgentError(e.code, parsed) from e

    def verify_signup(self, **options: Any) -> MutableMapping[str, Any]:
        """POST /v1/agent/verify"""
        return self._request("POST", "/v1/agent/verify", options)

    def get_profile(self) -> MutableMapping[str, Any]:
        """GET /v1/me"""
        return self._request("GET", "/v1/me")

    def get_agent_hub(self) -> MutableMapping[str, Any]:
        """GET /v1/agent"""
        return self._request("GET", "/v1/agent")

    def create_inbox(self, **options: Any) -> MutableMapping[str, Any]:
        """POST /v1/inboxes"""
        return self._request("POST", "/v1/inboxes", options)

    def delete_inbox(self, inbox_id: str) -> MutableMapping[str, Any]:
        """DELETE /v1/inboxes/:id"""
        return self._request("DELETE", f"/v1/inboxes/{inbox_id}")

    def cleanup_inboxes(
        self, *, label_prefix: Optional[str] = None, run_id: Optional[str] = None
    ) -> MutableMapping[str, Any]:
        """DELETE /v1/inboxes?labelPrefix=..."""
        prefix = label_prefix or (f"agent-{run_id}" if run_id else "")
        return self._request(
            "DELETE",
            f"/v1/inboxes?labelPrefix={urllib.parse.quote(prefix)}",
        )

    def list_messages(
        self, inbox_id: str, *, subject_contains: Optional[str] = None
    ) -> MutableMapping[str, Any]:
        q = ""
        if subject_contains:
            q = f"?subjectContains={urllib.parse.quote(subject_contains)}"
        return self._request("GET", f"/v1/inboxes/{inbox_id}/messages{q}")

    def simulate_message(
        self, inbox_id: str, **options: Any
    ) -> MutableMapping[str, Any]:
        """POST /v1/inboxes/:id/simulate"""
        return self._request(
            "POST", f"/v1/inboxes/{inbox_id}/simulate", options
        )

    def diagnose_inbox(
        self,
        inbox_id: str,
        *,
        subject_contains: Optional[str] = None,
        message_index: Optional[int] = None,
    ) -> MutableMapping[str, Any]:
        params: list[str] = []
        if subject_contains:
            params.append(
                "subjectContains=" + urllib.parse.quote(subject_contains)
            )
        if message_index is not None:
            params.append(f"messageIndex={message_index}")
        q = f"?{'&'.join(params)}" if params else ""
        return self._request("GET", f"/v1/inboxes/{inbox_id}/diagnose{q}")

    def list_runs(
        self, *, run_id: Optional[str] = None, label: Optional[str] = None, limit: int = 30
    ) -> MutableMapping[str, Any]:
        params: list[str] = [f"limit={limit}"]
        if run_id:
            params.append(f"runId={urllib.parse.quote(run_id)}")
        if label:
            params.append(f"label={urllib.parse.quote(label)}")
        return self._request("GET", f"/v1/agent/runs?{'&'.join(params)}")

    def get_run_timeline(self, run_id: str) -> MutableMapping[str, Any]:
        return self._request(
            "GET", f"/v1/agent/runs/{urllib.parse.quote(run_id)}/timeline"
        )
