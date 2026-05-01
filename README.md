# TaskFlow - Team Task Manager

A full-stack web application for team task management with role-based access control, real-time updates, and a Kanban board.

## Features

- **Authentication**: Secure signup/login with JWT tokens and bcrypt password hashing
- **Project Management**: Create projects, invite team members by email
- **Task Management**: Create, assign, and track tasks with priorities and due dates
- **Kanban Board**: Visual task board with drag-and-drop support across To Do, In Progress, and Done columns
- **Dashboard**: Overview with total tasks, tasks by status, tasks per user, charts, and overdue task list
- **Role-Based Access**: Admin (full control) and Member (view/update assigned tasks only)
- **Real-Time Updates**: Socket.io powered live updates across all connected users
- **Optimistic Locking**: Prevents conflicts when multiple users edit the same task

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS + Recharts + Socket.io Client + @hello-pangea/dnd
- **Backend**: Node.js + Express + Socket.io
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: JWT + bcrypt + Rate Limiting

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Layout, ProtectedRoute
│   │   ├── context/        # AuthContext, SocketContext
│   │   ├── lib/            # API client (axios)
│   │   └── pages/          # Login, Signup, Dashboard, Projects, ProjectDetail
│   └── vite.config.js
├── server/                 # Express backend
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema
│   │   └── prisma.config.ts # Prisma v7 config
│   ├── src/
│   │   ├── middleware/      # Auth, RBAC
│   │   ├── routes/          # Auth, Projects, Tasks, Dashboard
│   │   └── utils/           # Prisma client
│   └── .env
└── README.md
```

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/ATHARVA262005/team-task-manager.git
   cd team-task-manager
   ```

2. Install dependencies:
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

3. Set up environment variables in `server/.env`:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/taskmanager"
   JWT_SECRET="your-secret-key"
   PORT=5000
   CLIENT_URL="http://localhost:5173"
   ```

4. Run database migrations:
   ```bash
   cd server
   npx prisma migrate dev
   ```

5. Start the development servers:
   ```bash
   # Terminal 1 - Backend
   cd server && npm run dev

   # Terminal 2 - Frontend
   cd client && npm run dev
   ```

6. Open http://localhost:5173

## Deployment (Railway)

1. Push your code to GitHub

2. Go to [railway.app](https://railway.app) and create a new project

3. Add a **PostgreSQL** database service from the Railway dashboard

4. Deploy from GitHub repo:
   - Railway auto-detects Node.js
   - Build command: `cd client && npm install && npm run build && cd ../server && npm install && npx prisma generate`
   - Pre-Deploy command: `cd server && npx prisma migrate deploy`
   - Start command: `cd server && node src/index.js`
   - The server serves the React build in production, so everything runs on one URL

5. Set environment variables in Railway:
   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | Copy from Railway PostgreSQL service |
   | `JWT_SECRET` | Generate a random secret string |
   | `NODE_ENV` | `production` |

6. Railway will auto-deploy on every push to main. Migrations run automatically via Pre-Deploy command.

7. Your app will be live at the Railway-provided URL

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/signup | Register a new user |
| POST | /api/auth/login | Login (returns JWT) |
| GET | /api/auth/me | Get current user |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/projects | Create project (creator = Admin) |
| GET | /api/projects | List user's projects |
| GET | /api/projects/:id | Get project details + tasks |
| PUT | /api/projects/:id | Update project (Admin only) |
| DELETE | /api/projects/:id | Delete project (Admin only) |
| POST | /api/projects/:id/members | Add member by email (Admin) |
| PUT | /api/projects/:id/members/:uid | Change member role (Admin) |
| DELETE | /api/projects/:id/members/:uid | Remove member (Admin) |

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/projects/:pid/tasks | Create task (Admin only) |
| GET | /api/projects/:pid/tasks | List tasks (paginated) |
| GET | /api/tasks/:id | Get task details |
| PUT | /api/tasks/:id | Update task (with version lock) |
| DELETE | /api/tasks/:id | Delete task (Admin only) |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/dashboard | Get aggregated stats |

## Role-Based Access

| Action | Admin | Member |
|--------|-------|--------|
| Create project | Yes | No |
| Manage members | Yes | No |
| Create tasks | Yes | No |
| Edit any task field | Yes | No |
| Update assigned task status | Yes | Yes |
| Delete tasks | Yes | No |
| View project tasks | Yes | Yes |
| Change member roles | Yes | No |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | Secret key for JWT signing | Yes |
| `PORT` | Server port (default: 5000) | No |
| `CLIENT_URL` | Frontend URL for CORS | No |
| `NODE_ENV` | Set to `production` for deployment | No |
