import dotenv from 'dotenv';
import { RAGConfig } from '../types';

export const config = {
  // API Keys
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  cohereApiKey: process.env.COHERE_API_KEY || '',
  
  // Azure OpenAI (chat/completions) - CAGE-RS
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY || '',
  azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME || 'iagenerativacageopenai',
  azureOpenAIApiBaseEndpoint: process.env.AZURE_OPENAI_BASE_ENDPOINT || 'https://iagenerativacageopenai.openai.azure.com/',
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview',
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME || 'gpt-4o',
  
  // Azure OpenAI (embeddings)
  azureOpenAIEmbeddingEndpoint: process.env.AZURE_OPENAI_EMBEDDING_ENDPOINT || '',
  azureOpenAIEmbeddingsDeployment: process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT || '',

// Azure AI Search - CAGE-RS
  azureSearchEndpoint: process.env.AZURE_SEARCH_ENDPOINT || 'https://iagenerativacageaisearch.search.windows.net',
  azureSearchIndex: process.env.AZURE_SEARCH_INDEX || 'rag-cagesefaz-01',
  azureSearchApiKey: process.env.AZURE_SEARCH_API_KEY || '',
  
  // (Legacy Chroma vector store removed)
  
  // App Config
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  // Feature flags (public)
  appUseAiSearchFilter: (process.env.NEXT_PUBLIC_APP_USE_AI_SEARCH_FILTER || 'false') === 'true',
};

export const ragConfig: RAGConfig = {
  chunkSize: 1500,        // Aumentado para mais contexto por chunk
  chunkOverlap: 300,      // Maior overlap para preservar contexto entre chunks
  topK: 20,               // Reduzido para menos ruído na busca inicial
  rerankTopK: 12,         // Aumentado para mais documentos no LLM
  similarityThreshold: 0.4, // Reduzido para ser menos restritivo
  models: [
    {
      name: 'gpt-4o',
      provider: 'azure',
      priority: 1,
      maxTokens: 8000,        // Aumentado para respostas mais completas
      temperature: 0.1,       // Ligeiramente mais criativo para melhor compreensão
      isAvailable: !!config.azureOpenAIApiKey
    },
    {
      name: 'gpt-4o-mini',
      provider: 'openai',
      priority: 2,
      maxTokens: 8000,        // Aumentado para respostas mais completas
      temperature: 0.1,       // Ligeiramente mais criativo para melhor compreensão
      isAvailable: !!config.openaiApiKey,
    },
    {
      name: 'gpt-3.5-turbo',
      provider: 'openai',
      priority: 3,
      maxTokens: 8000,        // Aumentado para respostas mais completas
      temperature: 0.1,       // Ligeiramente mais criativo para melhor compreensão
      isAvailable: !!config.openaiApiKey,
    }
  ],
  retryConfig: {
    maxRetries: 3,
    initialDelay: 1000,
    backoffMultiplier: 2,
    maxDelay: 10000,
  },
};
