-- AddColumn
ALTER TABLE "query_traces" ADD COLUMN "providerFallback" BOOLEAN NOT NULL DEFAULT false;
