-- PostGIS spatial indexes for fast cross-border ST_DWithin "nearby" queries (brief §7).
-- Coordinates are stored as latitude/longitude columns; these expression GIST
-- indexes let Postgres answer radius queries without a materialized geometry column.

CREATE INDEX IF NOT EXISTS "Venue_geog_idx"
  ON "Venue"
  USING GIST ( (ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography) )
  WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "UserLocation_geog_idx"
  ON "UserLocation"
  USING GIST ( (ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography) );
