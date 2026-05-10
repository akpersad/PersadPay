-- Allow multiple signed_documents rows for sick_leave_summary (each employee
-- request produces a distinct copy that should be kept for record-keeping).
-- All other document types retain single-copy semantics via the partial index.
ALTER TABLE signed_documents DROP CONSTRAINT signed_documents_document_type_key;

CREATE UNIQUE INDEX signed_documents_single_type_unique
  ON signed_documents (document_type)
  WHERE document_type != 'sick_leave_summary';
