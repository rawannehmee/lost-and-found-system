# API Documentation

Base URL: `http://localhost:3000/api`

All requests and responses are JSON. For POST and PUT you need the header `Content-Type: application/json`.

## Item fields

| Field | Type | Notes |
|-------|------|-------|
| id | integer | auto generated |
| type | string | "lost" or "found" |
| title | string | required |
| description | string | optional, defaults to "" |
| category | string | one of: electronics, clothing, documents, keys, bags, jewelry, books, other |
| location | string | required |
| date | string | required, format YYYY-MM-DD |
| status | string | "open" (default) or "resolved" |
| contact_name | string | required |
| contact_info | string | required (email or phone) |
| created_at | string | set automatically (UTC) |

## GET /api/items

Returns all items, newest first. Optional query parameters (can be combined):

- `type` = lost or found
- `category` = one category
- `status` = open or resolved
- `q` = text search over title, description and location

Example: `GET /api/items?type=lost&category=electronics&q=airpods`

Returns 200 with an array. Returns 400 if a filter value is invalid.

## GET /api/items/:id

Returns one item. 200 on success, 400 if the id is not a positive integer, 404 if it does not exist.

## POST /api/items

Creates an item. Required fields: type, title, category, location, date, contact_name, contact_info. Description is optional and status starts as "open".

Returns 201 with the created item and a Location header. On invalid input returns 400 with an "errors" array that lists every problem, for example:

```json
{ "errors": ["'title' must be a non-empty string", "'date' must be a valid date in YYYY-MM-DD format"] }
```

## PUT /api/items/:id

Updates an item. You can send only the fields you want to change, so marking an item as resolved is just:

```json
{ "status": "resolved" }
```

Returns 200 with the updated item, 400 on invalid values, 404 if the item does not exist.

## DELETE /api/items/:id

Deletes an item. Returns 204 with no body, 400 for a bad id, 404 if it does not exist.
