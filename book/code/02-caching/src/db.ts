import { Pool } from 'pg';

export interface FormRow {
  id: string;
  slug: string;
  title: string;
  schema: unknown;
}

export interface FormStore {
  getBySlug(slug: string): Promise<FormRow | null>;
  /** Used by the PATCH route; the exercise moves it into FormCache.publish. */
  updateTitle(slug: string, title: string): Promise<boolean>;
}

function toFormRow(row: Record<string, unknown>): FormRow {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    schema: row.schema,
  };
}

/** All queries parameterized (chapter 02, section 3 step 5; ch 78). */
export function createDb(pool: Pool): FormStore {
  return {
    async getBySlug(slug: string): Promise<FormRow | null> {
      const { rows } = await pool.query(
        `SELECT id, slug, title, schema_json AS schema
           FROM forms
          WHERE slug = $1 AND published`,
        [slug],
      );
      const row = rows[0];
      return row ? toFormRow(row) : null;
    },
    async updateTitle(slug: string, title: string): Promise<boolean> {
      const { rowCount } = await pool.query(
        `UPDATE forms SET title = $2, updated_at = now() WHERE slug = $1`,
        [slug, title],
      );
      return (rowCount ?? 0) > 0;
    },
  };
}
