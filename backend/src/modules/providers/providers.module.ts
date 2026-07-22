import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EMBEDDING_PROVIDER } from './embedding.provider';
import { GENERATION_PROVIDER, GenerationProvider } from './generation.provider';
import { GeminiEmbeddingProvider } from './gemini-embedding.provider';
import { GeminiGenerationProvider } from './gemini-generation.provider';
import { GroqGenerationProvider } from './groq-generation.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    GeminiEmbeddingProvider,
    {
      provide: EMBEDDING_PROVIDER,
      useClass: GeminiEmbeddingProvider,
    },
    {
      provide: GENERATION_PROVIDER,
      useFactory: (config: ConfigService): GenerationProvider => {
        const provider = config.get<string>('PROVIDER') ?? 'gemini';
        return provider === 'groq'
          ? new GroqGenerationProvider(config)
          : new GeminiGenerationProvider(config);
      },
      inject: [ConfigService],
    },
  ],
  exports: [EMBEDDING_PROVIDER, GENERATION_PROVIDER],
})
export class ProvidersModule {}
