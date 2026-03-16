# opcli - OpenProject CLI Tool

## Overview

CLI tool to list and update task statuses on OpenProject instance at `devtak.cbidigital.com`. Built with TypeScript, Commander.js, and Inquirer.js.

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js
- **CLI framework:** Commander.js
- **Interactive prompts:** Inquirer.js
- **HTTP client:** Built-in fetch (Node 18+)
- **Auth:** Basic Auth (username/password)
- **Node.js:** >= 18.0.0 (enforced via `engines` in package.json)
- **Build:** TypeScript compiled to ESM, output to `dist/`

## Project Structure

```
opcli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point, Commander setup
│   ├── commands/
│   │   ├── config.ts         # opcli config (setup credentials)
│   │   └── tasks.ts          # opcli tasks list / update
│   ├── api/
│   │   └── openproject.ts    # HTTP client for OpenProject API
│   ├── config/
│   │   └── store.ts          # Read/write ~/.opcli/config.json
│   └── utils/
│       └── prompts.ts        # Inquirer interactive prompts
├── bin/
│   └── opcli.js              # Executable entry
```

## Configuration

Config file location: `~/.opcli/config.json`

```json
{
  "url": "https://devtak.cbidigital.com",
  "username": "user",
  "password": "base64_encoded_password"
}
```

Password is base64 encoded (not encrypted, just to avoid plaintext visibility).

## Commands

### `opcli config setup`

Interactive setup for credentials. Prompts for username and password, verifies connection to OpenProject API, saves to config file.

### `opcli tasks list`

Lists work packages assigned to the current user.

Output format (table):
```
ID    | Status      | Priority | Subject
1234  | In Progress | High     | Fix login bug
1235  | New         | Normal   | Add dashboard
```

### `opcli tasks update [id] [--status <status>]`

Updates the status of a work package.

- **Command-based:** `opcli tasks update 1234 --status "In Progress"`
- **Interactive (missing args):** Prompts user to select task from list, then select status from available statuses, then confirms before updating.

## API Integration

### Endpoints Used

1. **Get current user:** `GET /api/v3/users/me` to resolve user ID (used during `config setup` to verify credentials, cache user ID)
2. **List tasks:** `GET /api/v3/work_packages` with filter `[{"assignee":{"operator":"=","values":["me"]}}]`
3. **List available statuses for a work package:** `GET /api/v3/work_packages/{id}/available_statuses` (returns only valid transitions, not all statuses)
4. **Get work package:** `GET /api/v3/work_packages/{id}` to fetch current `lockVersion`
5. **Update task:** `PATCH /api/v3/work_packages/{id}` with body `{ "lockVersion": <current>, "_links": { "status": { "href": "/api/v3/statuses/{statusId}" } } }`

### Update Flow

1. Fetch work package to get current `lockVersion`
2. Fetch available statuses for that work package (only valid transitions)
3. Send PATCH with `lockVersion` and new status link

### Status Matching

When `--status` flag is provided as a string, match by exact status name (case-insensitive). If no exact match, display available statuses and exit with error.

### Authentication

Basic Auth header: `Authorization: Basic base64(username:password)`

## Error Handling

- **No config:** Error message suggesting `opcli config setup`
- **Auth fail (401/403):** Report bad credentials, suggest re-running `opcli config setup`
- **Network error:** Report connection failure, show target URL
- **Invalid status transition:** Display error message from OpenProject API
- **No tasks assigned:** Inform user no tasks are assigned
- **Task not found:** Report task ID does not exist

No automatic retries. Fail fast with clear error messages.
