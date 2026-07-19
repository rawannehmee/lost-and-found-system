# Lost and Found System (Cloud)

CPEG/CSIS445 Cloud Computing, Assignment 2, Theme 14

Same app as Assignment 1, a lost and found board for AUK, but running on AWS instead of a laptop. New in this version: you can attach a photo of the item.

Stack:
- Frontend: HTML, CSS and plain JavaScript (public folder), served by Express
- Backend: Node.js with Express (server.js) on an EC2 instance
- Database: MySQL on Amazon RDS (db.js), was SQLite in Assignment 1
- Photos: Amazon S3 (s3.js), private bucket, pre-signed URLs only

Photos never pass through our server. The browser asks the API for a pre-signed URL and uploads straight to S3, and photos are shown with pre-signed download links that expire after an hour.

# What changed from Assignment 1

- db.js rewritten from the built in node:sqlite module to mysql2 with a connection pool. Everything is async now since the database is over the network.
- All connection details moved to environment variables (.env, see .env.example). Nothing sensitive is in the code or in git.
- No AWS access keys anywhere. On EC2 the app gets S3 permissions from an IAM role attached to the instance.
- New endpoint POST /api/uploads that returns a pre-signed S3 upload URL, and an optional photo_key field on items. Responses include photo_url. Deleting an item (or replacing/removing its photo) also deletes the object from S3.
- deploy folder with the IAM policy, the S3 CORS config and a systemd service file, plus a GitHub Actions workflow that redeploys on push to main.

# Running it

On AWS: follow DEPLOYMENT_GUIDE.md from top to bottom.

Locally (needs a MySQL server):

```
npm install
cp .env.example .env   # fill in DB details, leave S3_BUCKET empty to run without photos
npm start
open http://localhost:3000
```

The items table is created with some sample rows the first time the server starts.

# The API

Full documentation in docs/API.md, OpenAPI spec in docs/openapi.yaml (paste it into editor.swagger.io to view).

- POST /api/uploads (new, get a pre-signed S3 upload URL for a photo)
- GET /api/items (filters: ?type= &category= &status= &q= for text search)
- GET /api/items/:id
- POST /api/items
- PUT /api/items/:id (partial updates allowed, e.g. just {"status":"resolved"} or {"photo_key":null} to remove a photo)
- DELETE /api/items/:id (also removes the photo from S3)

Quick test after deploying (replace the IP):

```
curl http://EC2-IP:3000/api/items
curl "http://EC2-IP:3000/api/items?type=lost&q=backpack"
```

Validation is the same as before, bad data gets a 400 with a list of all the problems, missing items give a 404, everything comes back as JSON including errors.

# Files

- server.js - Express routes and validation
- db.js - RDS MySQL schema, seed data and queries
- s3.js - pre-signed URLs and S3 cleanup
- public/ - index.html, styles.css, app.js
- docs/ - API documentation
- deploy/ - IAM policy, S3 CORS config, systemd service
- DEPLOYMENT_GUIDE.md - AWS setup step by step
