-- Chapter 02 origin schema (subset of the book-wide FormForge schema).
CREATE TABLE forms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  title         text NOT NULL,
  schema_json   jsonb NOT NULL,
  published     boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- The hot query: published forms by slug (chapter 03/25 refine indexing).
CREATE INDEX forms_published_slug_idx ON forms (slug) WHERE published;

INSERT INTO forms (slug, title, schema_json, published) VALUES
  ('contact-us',   'Contact Us',      '{"fields":[{"id":"email","type":"email"}]}',  true),
  ('event-rsvp',   'Event RSVP',      '{"fields":[{"id":"name","type":"text"}]}',    true),
  ('nps-quarterly','Quarterly NPS',   '{"fields":[{"id":"score","type":"number"}]}', true),
  ('draft-only',   'Unpublished Draft','{"fields":[]}',                              false);
