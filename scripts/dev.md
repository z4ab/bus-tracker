# Shared dev workflow (FastAPI + Vite)

## 1) Backend setup

From `backend/`:

- Create and activate a virtual environment.
- Install dependencies:
  - `pip install -r requirements.txt`
- Create `backend/.env` using the root `.env.example` as a reference.

Run the API (with env file):
- `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --env-file .env`

## 2) Frontend setup

From `frontend/`:

- Install dependencies:
  - `npm install`
- Create `frontend/.env` with:
  - `VITE_API_BASE_URL=http://localhost:8000`

Run the Vite dev server:
- `npm run dev`

## 3) Linting & formatting

Backend (from `backend/`):
- `ruff check .`
- `black .`

Frontend (from `frontend/`):
- `npm run lint`
- `npm run format`
