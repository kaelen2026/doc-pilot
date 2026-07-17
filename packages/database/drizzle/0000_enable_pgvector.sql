-- Enable pgvector. Required by document_chunks.embedding (VECTOR) in later phases.
-- See docs/architecture/data-model.md and ADR-002.
CREATE EXTENSION IF NOT EXISTS vector;
