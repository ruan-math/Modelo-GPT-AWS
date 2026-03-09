export interface DocumentReference {
  id: string;
  content: string;
  score?: number;
  source?: string;
  metadata?: {
    title?: string;
    source?: string;
    category?: string;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface RAGConfig {
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  rerankTopK: number;
  similarityThreshold: number;
  retryConfig?: {
    maxRetries: number;
    initialDelay: number;
    backoffMultiplier: number;
    maxDelay: number;
  };
}

export interface AWSConfig {
  region: string;
  bedrock: {
    modelId: string;
    embeddingModelId: string;
  };
  openSearch: {
    endpoint: string;
    index: string;
  };
  dynamoDB: {
    tableName: string;
  };
  s3: {
    bucket: string;
  };
}