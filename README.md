# Lost and Found System

CPEG/CSIS445 Cloud Computing, Assignment 1, Theme 14

A lost and found website for AUK. If you lose something you post it, if you find something you post it, and people can search the board and contact each other through the details on each post. When an item gets returned you mark the post as resolved.

Stack:
- Frontend: HTML, CSS and plain JavaScript (in the public folder)
- Backend: Node.js with Express (server.js)
- Database: SQLite using the module built into Node 22 (db.js)

The frontend talks to the backend only through the REST API with JSON, it never touches the database directly.

# How to run

open terminal
npm install
npm start
open http://localhost:3000

The database file lostfound.db is created with some sample items the first time you run it. Delete the file if you want to reset the data.

# The API

There is one resource, items. Full documentation is in docs/API.md and there is an OpenAPI spec in docs/openapi.yaml which you can view by pasting it into editor.swagger.io

- GET /api/items (filters: ?type= &category= &status= &q= for text search)
- GET /api/items/:id
- POST /api/items
- PUT /api/items/:id (partial updates allowed, e.g. just {"status":"resolved"})
- DELETE /api/items/:id

Quick test after starting the server:

curl http://localhost:3000/api/items
curl "http://localhost:3000/api/items?type=lost&q=backpack"
curl -X DELETE http://localhost:3000/api/items/1

Validation is done on the server. If you send bad data the API answers with a 400 and a list of all the problems, missing items give a 404, and everything comes back as JSON including errors.

# Files

- server.js - the Express routes and validation
- db.js - database schema, seed data and queries
- public/ - index.html, styles.css, app.js (the whole frontend)
- docs/ - API documentation
