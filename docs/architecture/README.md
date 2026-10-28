# Standfolk Architecture

Standfolk currently runs as a small Azure Container Apps demo. The public web app serves the React dashboard and Node.js API; an internal app runs the Python Microsoft Agent Framework workflow. The fictional world is bundled as JSON, match events are deterministic, and SQLite FTS5 is built as an in-memory retrieval index. Studio approvals and on-air state are process-local.

- [Current demo architecture](current.html)
- [Proposed Azure scale architecture](future.html)
- [Azure scale roadmap](../design/azure-scale-roadmap.md)

The scale design is a future proposal. Event Hubs, PostgreSQL, Data Lake Storage Gen2, and Azure Data Explorer are not part of the deployed demo.
