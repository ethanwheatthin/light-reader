import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Shelves table (must come first for FK reference)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shelves" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(200) NOT NULL,
        "color" varchar(7) NOT NULL,
        "display_order" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Documents table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "documents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" varchar(500) NOT NULL,
        "type" varchar(10) NOT NULL CHECK ("type" IN ('epub', 'pdf')),
        "file_size" bigint NOT NULL,
        "upload_date" timestamptz NOT NULL DEFAULT now(),
        "last_opened" timestamptz,
        "current_page" integer,
        "total_pages" integer,
        "current_cfi" text,
        "reading_progress_percent" numeric(5,2),
        "shelf_id" uuid REFERENCES "shelves"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Book metadata
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "book_metadata" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "document_id" uuid NOT NULL UNIQUE REFERENCES "documents"("id") ON DELETE CASCADE,
        "author" varchar(500),
        "publisher" varchar(500),
        "publish_year" varchar(10),
        "isbn" varchar(20),
        "cover_url" text,
        "description" text,
        "page_count" integer,
        "open_library_key" varchar(100),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Subjects
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subjects" (
        "id" serial PRIMARY KEY,
        "name" varchar(200) NOT NULL UNIQUE
      )
    `);

    // Book subjects (many-to-many)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "book_subjects" (
        "book_metadata_id" uuid REFERENCES "book_metadata"("id") ON DELETE CASCADE,
        "subject_id" integer REFERENCES "subjects"("id") ON DELETE CASCADE,
        PRIMARY KEY ("book_metadata_id", "subject_id")
      )
    `);

    // Bookmarks
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bookmarks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
        "location" varchar(500) NOT NULL,
        "label" varchar(500) NOT NULL,
        "note" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Reading sessions
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reading_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
        "started_at" timestamptz NOT NULL,
        "ended_at" timestamptz NOT NULL,
        "duration" integer NOT NULL,
        "pages_read" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Reading stats (aggregated)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reading_stats" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "document_id" uuid NOT NULL UNIQUE REFERENCES "documents"("id") ON DELETE CASCADE,
        "total_reading_time" bigint NOT NULL DEFAULT 0,
        "first_opened_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Reading goals
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reading_goals" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "document_id" uuid NOT NULL UNIQUE REFERENCES "documents"("id") ON DELETE CASCADE,
        "daily_minutes" integer NOT NULL,
        "current_streak" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Reading goal completed days
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reading_goal_completed_days" (
        "id" serial PRIMARY KEY,
        "reading_goal_id" uuid NOT NULL REFERENCES "reading_goals"("id") ON DELETE CASCADE,
        "completed_date" date NOT NULL,
        CONSTRAINT "unique_goal_date" UNIQUE ("reading_goal_id", "completed_date")
      )
    `);

    // Document files (for database storage strategy)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document_files" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "document_id" uuid NOT NULL UNIQUE REFERENCES "documents"("id") ON DELETE CASCADE,
        "file_path" text,
        "file_data" bytea,
        "mime_type" varchar(100) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Indexes for performance
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_documents_shelf_id" ON "documents"("shelf_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_bookmarks_document_id" ON "bookmarks"("document_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_reading_sessions_document_id" ON "reading_sessions"("document_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_reading_sessions_started_at" ON "reading_sessions"("started_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reading_goal_completed_days" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reading_goals" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reading_stats" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reading_sessions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bookmarks" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "book_subjects" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subjects" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "book_metadata" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "document_files" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "documents" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shelves" CASCADE`);
  }
}
