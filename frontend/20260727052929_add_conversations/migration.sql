-- DropIndex
DROP INDEX "chunks_content_tsv_idx";

-- DropIndex
DROP INDEX "idx_chunks_embedding_hnsw";

-- AlterTable
ALTER TABLE "chunks" ALTER COLUMN "content_tsv" DROP DEFAULT;
