# TaskFlow - Team Task Manager

A full-stack web application for team task management with role-based access control.

## Features

- **Authentication**: Signup/Login with JWT tokens
- **Project Management**: Create projects, invite team members
- **Task Management**: Create, assign, and track tasks with priorities and due dates
- **Kanban Board**: Visual task board with To Do, In Progress, and Done columns
- **Dashboard**: Overview of tasks by status, priority, and project
- **Role-Based Access**: Admin (full control) and Member (assigned tasks only)

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS + Recharts
- **Backend**: Node.js + Express
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: JWT + bcrypt

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Setup

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd team-task-manager
   ```

2. Install dependencies:
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

3. Set up environment variables:
   ```bash
   # server/.env
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

1. Push to GitHub
2. Go to [railway.app](https://railway.app)
3. Create a new project from GitHub repo
4. Add a PostgreSQL database service
5. Set environment variables:
   - `DATABASE_URL` (from Railway PostgreSQL)
   - `JWT_SECRET` (random secret)
   - `NODE_ENV=production`
   - `CLIENT_URL` (your deployed frontend URL)
6. Railway will auto-deploy on push

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/signup | Register |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Current user |
| POST | /api/projects | Create project |
| GET | /api/projects | List projects |
| GET | /api/projects/:id | Project details |
| PUT | /api/projects/:id | Update project |
| DELETE | /api/projects/:id | Delete project |
| POST | /api/projects/:id/members | Add member |
| DELETE | /api/projects/:id/members/:uid | Remove member |
| POST | /api/projects/:pid/tasks | Create task |
| GET | /api/projects/:pid/tasks | List tasks |
| GET | /api/tasks/:id | Task details |
| PUT | /api/tasks/:id | Update task |
| DELETE | /api/tasks/:id | Delete task |
| GET | /api/dashboard | Dashboard stats |

## Role-Based Access

| Action | Admin | Member |
|--------|-------|--------|
| Create project | Yes | No |
| Manage members | Yes | No |
| Create tasks | Yes | Yes |
| Edit any task | Yes | No |
| Update assigned task status | Yes | Yes |
| Delete tasks | Yes | No |
