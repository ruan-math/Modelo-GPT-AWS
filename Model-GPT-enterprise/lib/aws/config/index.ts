import { AWSConfig, RAGConfig } from '../../types';

export const awsConfig: AWSConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  bedrock: {
    modelId: process.env.AWS_BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0',
    embeddingModelId: process.env.AWS_BEDROCK_EMBEDDING_MODEL_ID || 'amazon.titan-embed-text-v1',
  },
  openSearch: {
    endpoint: process.env.AWS_OPENSEARCH_ENDPOINT || '',
    index: process.env.AWS_OPENSEARCH_INDEX || 'rag-index',
  },
  dynamoDB: {
    tableName: process.env.AWS_DYNAMODB_TABLE || 'EnterpriseGPT-Conversations',
  },
  s3: {
    bucket: process.env.AWS_S3_BUCKET || 'enterprise-gpt-assets',
  }
};

// Validação básica das configurações obrigatórias
if (!awsConfig.openSearch.endpoint) {
  throw new Error('AWS_OPENSEARCH_ENDPOINT é obrigatório');
}

export const ragConfig: RAGConfig = {
  chunkSize: 1500,
  chunkOverlap: 300,
  topK: 20,
  rerankTopK: 12,
  similarityThreshold: 0.4,
  retryConfig: {
    maxRetries: 3,
    initialDelay: 1000,
    backoffMultiplier: 2,
    maxDelay: 10000,
  },
};
