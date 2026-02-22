# LibReader

An open-source EPUB/PDF reader application built with Angular 21, NgRx, Express, and PostgreSQL.

## Quick Start with Docker

The fastest way to run LibReader is with Docker Compose. This starts the Angular frontend, the Express backend, and a PostgreSQL database — all in one command.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) (v2+)

### 1. Clone the repository

```bash
git clone https://github.com/<your-org>/light-reader.git
cd light-reader
```

### 2. (Optional) Configure environment

Copy the example env file and adjust values if needed:

```bash
cp .env.example .env
```

| Variable            | Default           | Description                              |
|---------------------|-------------------|------------------------------------------|
| `POSTGRES_USER`     | `libreader`       | PostgreSQL username                      |
| `POSTGRES_PASSWORD` | `libreader_pass`  | PostgreSQL password                      |
| `POSTGRES_DB`       | `libreader`       | PostgreSQL database name                 |
| `APP_PORT`          | `4600`            | Port the app is accessible on            |

### 3. Start the application

```bash
docker compose up -d
```

This builds and starts three containers:

| Container              | Description                        |
|------------------------|------------------------------------|
| `libreader-frontend`   | Angular app served by Nginx        |
| `libreader-backend`    | Express API server                 |
| `libreader-db`         | PostgreSQL 16 database             |

The database migrations run automatically on first startup.

### 4. Open LibReader

Navigate to **http://localhost:4600** in your browser.

### Stopping

```bash
docker compose down
```

To also delete stored data (books, database):

```bash
docker compose down -v
```

### Updating

```bash
git pull
docker compose up -d --build
```

---

## Development

### Local development server

```bash
npm install
npm start
```

Open `http://localhost:4200/`. The app auto-reloads on file changes.

### Backend (requires PostgreSQL running)

```bash
cd backend
npm install
npm run dev
```

### Building

```bash
ng build
```

Build artifacts are stored in `dist/`.

### Running unit tests

```bash
npm test
```

Tests use [Vitest](https://vitest.dev/).

## Architecture

- **Frontend:** Angular 21 standalone components, NgRx state management, Angular Material
- **Backend:** Express + TypeORM (PostgreSQL)
- **Storage:** File uploads stored on disk (`uploads/` volume), metadata in PostgreSQL

## License

See [LICENSE](LICENSE) for details.
