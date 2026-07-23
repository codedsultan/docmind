import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EMBEDDING_PROVIDER } from './embedding.provider';
import { GENERATION_PROVIDER, GenerationProvider } from './generation.provider';
import { GeminiEmbeddingProvider } from './gemini-embedding.provider';
import { GeminiGenerationProvider } from './gemini-generation.provider';
import { GroqGenerationProvider } from './groq-generation.provider';
import { FallbackGenerationProvider } from './fallback-generation.provider';

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
      useFactory: (
        config: ConfigService,
        events: EventEmitter2,
      ): GenerationProvider => {
        const primaryName = config.get<string>('PROVIDER') ?? 'gemini';

        const gemini = new GeminiGenerationProvider(config);

        let groq: GroqGenerationProvider | null = null;
        try {
          groq = new GroqGenerationProvider(config);
        } catch {
          // GROQ_API_KEY not set — secondary unavailable
        }

        if (primaryName === 'groq' && groq) {
          return new FallbackGenerationProvider(groq, gemini, events);
        }

        if (groq) {
          return new FallbackGenerationProvider(gemini, groq, events);
        }

        return gemini;
      },
      inject: [ConfigService, EventEmitter2],
    },
  ],
  exports: [EMBEDDING_PROVIDER, GENERATION_PROVIDER],
})
export class ProvidersModule {}
