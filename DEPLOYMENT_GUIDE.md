# AWS Deployment Guide - AUK Lost + Found (Assignment 2)

Do the steps in order, later steps use names created in earlier ones.
Everything is free tier. Examples use us-east-1 (the region we deployed in), use whatever region was
said in class, but use the same one for everything (EC2, RDS, S3).

---

## Step 1 — S3 bucket (photo storage)

1. Console → **S3 → Create bucket**
2. Bucket name: `auk-lostfound-photos-<your-initials>-<random-number>`
   (bucket names are global, so it must be unique — e.g. `auk-lostfound-photos-rk-7391`)
3. Region: same as everything else
4. **Block all public access: keep ON (checked).** The app never makes the
   bucket public; the browser reads/writes photos only through pre-signed URLs.
5. Create bucket.
6. Open the bucket → **Permissions → Cross-origin resource sharing (CORS)**
   → Edit → paste the contents of `deploy/s3-cors.json` → Save.
   (this is what lets the browser PUT the image directly to S3)

## Step 2 — IAM policy + role (how EC2 talks to S3 without keys)

1. Console → **IAM → Policies → Create policy → JSON tab**
2. Paste `deploy/iam-policy-s3.json`, replacing `REPLACE_WITH_YOUR_BUCKET_NAME`
   with your real bucket name. Note the policy only allows
   `PutObject/GetObject/DeleteObject` on `items/*` — least privilege.
3. Name it: `LostFoundS3Policy` → Create.
4. **IAM → Roles → Create role**
   - Trusted entity: **AWS service → EC2**
   - Attach: `LostFoundS3Policy`
   - Role name: `LostFoundEC2Role` → Create.

This role is attached to the EC2 instance in Step 5. The AWS SDK on the
instance automatically receives temporary credentials from it — **no access
keys ever appear in code, in `.env`, or on the machine.**

## Step 3 — Security groups (network firewall)

Console → **EC2 → Security Groups → Create security group** (twice):

**A) `lostfound-web-sg`** — for the EC2 instance
| Type | Port | Source | Why |
|---|---|---|---|
| SSH | 22 | **My IP** | admin access from your machine only |
| Custom TCP | 3000 | Anywhere (0.0.0.0/0) | the web app |

**B) `lostfound-db-sg`** — for the RDS instance
| Type | Port | Source | Why |
|---|---|---|---|
| MySQL/Aurora | 3306 | **`lostfound-web-sg`** (choose the security group, not an IP) | only the app server can reach the DB |

This second rule is the important one: the database only accepts connections
from members of the web security group, meaning only our EC2 instance. It is
not reachable from the internet at all.

## Step 4 — RDS (MySQL)

1. Console → **RDS → Create database**
2. Standard create → **MySQL** (8.x)
3. Templates: **Free tier**
4. DB instance identifier: `lostfound-db`
5. Master username: `admin`, set a strong master password and write it down,
   it goes in `.env` in Step 6
6. Instance: `db.t3.micro` (or `db.t4g.micro`), storage 20 GB gp3,
   disable storage autoscaling (avoids surprise costs)
7. Connectivity:
   - VPC: default
   - **Public access: No**
   - VPC security group: choose existing → `lostfound-db-sg`
8. Additional configuration → **Initial database name: `lostfound`**
   (if you forget this, create it later with `CREATE DATABASE lostfound;`)
9. Create database, wait until status = Available, then copy the **Endpoint**
   (looks like `lostfound-db.xxxxxxxx.us-east-1.rds.amazonaws.com`).

## Step 5 — EC2 (web server)

1. Console → **EC2 → Launch instance**
2. Name: `lostfound-web`
3. AMI: **Ubuntu Server 26.04 LTS** (24.04 LTS also works)
4. Instance type: `t2.micro` or `t3.micro` (free tier)
5. Key pair: create new (`lostfound-key`), download the `.pem`, keep it safe
6. Network settings → Select existing security group → `lostfound-web-sg`
7. **Advanced details → IAM instance profile → `LostFoundEC2Role`**
   (easy to miss, this is what gives the app S3 access)
8. Launch, wait for running state, copy the **Public IPv4 address**.

## Step 6 — Install and run the app on EC2

SSH in (from the folder containing your `.pem`):

```bash
chmod 400 lostfound-key.pem
ssh -i lostfound-key.pem ubuntu@<EC2-PUBLIC-IP>
```

On the instance:

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # should print v22.x

# Get the code (or use scp / git clone of your repo)
git clone https://github.com/<your-username>/<your-repo>.git lost-and-found-cloud
cd lost-and-found-cloud
npm ci --omit=dev

# Configuration - secrets live in environment variables, never in code
cp .env.example .env
nano .env
```

Fill `.env` with:

```
PORT=3000
DB_HOST=<RDS endpoint from Step 4>
DB_PORT=3306
DB_USER=admin
DB_PASSWORD=<RDS master password>
DB_NAME=lostfound
AWS_REGION=us-east-1
S3_BUCKET=<bucket name from Step 1>
```

Note there are **no AWS access keys** here — the IAM role covers S3.

Test run:

```bash
npm start
# Expect: "Campus Lost & Found running on port 3000" and your DB host + bucket
# On first start the app creates the `items` table on RDS and seeds 6 rows.
```

Open `http://<EC2-PUBLIC-IP>:3000` in your browser: the board should load,
and reporting an item **with a photo** should work end-to-end
(browser → pre-signed PUT → S3; card shows the photo via pre-signed GET).

Stop the test (`Ctrl+C`), then install it as a service so it survives
reboots and crashes:

```bash
sudo cp deploy/lostfound.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lostfound
systemctl status lostfound        # should be active (running)
```

## Step 7 — Verify everything (screenshot checklist for the report)

Take screenshots of each of these for the report:

1. `http://<EC2-IP>:3000` — the app running from the cloud
2. An item card **with a photo** + the photo object visible in the S3 console
   (proves S3 integration)
3. RDS console showing `lostfound-db` Available + a query proving data is in
   RDS. From the EC2 shell:
   ```bash
   sudo apt-get install -y mysql-client
   mysql -h <RDS-endpoint> -u admin -p lostfound -e "SELECT id, title, photo_key FROM items;"
   ```
4. EC2 console: instance with `LostFoundEC2Role` attached (Security tab)
5. Both security groups' inbound rules (web-sg and db-sg — make sure the
   3306 rule visibly references the web security group)
6. IAM policy JSON page
7. S3 bucket Permissions page showing **Block all public access: On**
8. `systemctl status lostfound` showing active (running)

## Step 8 (optional, bonus) — Automated deployment with GitHub Actions

`.github/workflows/deploy.yml` is included. In your GitHub repo →
Settings → Secrets and variables → Actions, add:

- `EC2_HOST` = the EC2 public IP
- `EC2_SSH_KEY` = the full contents of `lostfound-key.pem`

Every push to `main` then copies the code to the instance and restarts the
service. Screenshot a green workflow run for the report.

## Cost control / teardown

Free tier covers 750 h/month of one t2/t3.micro EC2 **and** one db.t3.micro
RDS, plus 5 GB S3 — running one of each continuously is fine. After grading:

1. Terminate the EC2 instance
2. Delete the RDS instance (skip final snapshot)
3. Empty + delete the S3 bucket
4. Delete the security groups, role, and policy

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `ECONNREFUSED`/timeout to DB on startup | db-sg 3306 rule doesn't reference web-sg, RDS in a different VPC/region, or wrong endpoint in `.env` |
| `ER_ACCESS_DENIED_ERROR` | wrong DB_USER/DB_PASSWORD |
| `Unknown database 'lostfound'` | initial database name wasn't set → connect with mysql client and `CREATE DATABASE lostfound;` |
| Photo upload fails with CORS error in browser console | CORS config not saved on the bucket (Step 1.6) |
| Photo upload fails 403 | IAM role not attached to the instance, or policy has the wrong bucket name |
| Site unreachable | 3000 rule missing in web-sg, or you used http**s**:// (use http://) |
