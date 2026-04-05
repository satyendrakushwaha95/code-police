import { OllamaEmbeddingsService } from './embeddings';

const sharedInstance = new OllamaEmbeddingsService();

export function getSharedOllama(): OllamaEmbeddingsService {
  return sharedInstance;
}
