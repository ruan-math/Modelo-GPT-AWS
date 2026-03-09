import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { Client } from "@opensearch-project/opensearch";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { awsConfig, ragConfig } from "../config";
import { DocumentReference, ChatMessage } from "../../types";
import { logger } from "../utils/logger";
import { AWSErrorHandler } from "../utils/errorHandler";
import { Validator } from "../utils/validator";
import { MetricsCollector } from "../utils/metrics";
import { SimpleCache, RateLimiter } from "../utils/cache";

export class AWSRAGService {
  private bedrockClient: BedrockRuntimeClient;
  private openSearchClient: Client;
  private dynamoDBClient: DynamoDBDocumentClient;
  private embeddingCache: SimpleCache<number[]>;
  private rateLimiter: RateLimiter;

  constructor() {
    try {
      this.bedrockClient = new BedrockRuntimeClient({ region: awsConfig.region });
      this.openSearchClient = new Client({ node: awsConfig.openSearch.endpoint });
      const ddbClient = new DynamoDBClient({ region: awsConfig.region });
      this.dynamoDBClient = DynamoDBDocumentClient.from(ddbClient);
      this.embeddingCache = new SimpleCache<number[]>();
      this.rateLimiter = new RateLimiter(100, 1000);
      logger.info("AWSRAGService initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize AWSRAGService", error as Error);
      throw error;
    }
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string = "operation",
    maxRetries: number = ragConfig.retryConfig?.maxRetries || 3
  ): Promise<T> {
    let lastError: Error = new Error("Unknown error");
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.rateLimiter.canRequest();
        return await operation();
      } catch (error) {
        lastError = error as Error;
        const classified = AWSErrorHandler.classify(error);
        
        if (!classified.retryable || attempt >= maxRetries) {
          logger.error(`${operationName} failed after ${attempt + 1} attempts`, lastError, {
            errorType: classified.type,
            attempt: attempt + 1,
            maxRetries,
          });
          throw lastError;
        }

        const delay = (ragConfig.retryConfig?.initialDelay || 1000) * Math.pow(
          ragConfig.retryConfig?.backoffMultiplier || 2,
          attempt
        );
        const actualDelay = Math.min(delay, ragConfig.retryConfig?.maxDelay || 10000);
        
        logger.warn(`${operationName} attempt ${attempt + 1} failed, retrying in ${actualDelay}ms`, {
          error: classified.message,
          attempt: attempt + 1,
        });
        
        await new Promise(resolve => setTimeout(resolve, actualDelay));
      }
    }
    throw lastError;
  }

  async getQueryEmbedding(query: string): Promise<number[]> {
    const validation = Validator.validateQueryInput(query);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const cacheKey = `embedding:${query}`;
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const startTime = MetricsCollector.startOperation("getQueryEmbedding");
    
    try {
      const embedding = await this.withRetry(
        async () => {
          const input = {
            modelId: awsConfig.bedrock.embeddingModelId,
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({
              inputText: query,
            }),
          };

          const command = new InvokeModelCommand(input);
          const response = await this.bedrockClient.send(command);
          const responseBody = JSON.parse(new TextDecoder().decode(response.body));
          return responseBody.embedding as number[];
        },
        "getQueryEmbedding"
      );

      this.embeddingCache.set(cacheKey, embedding, 30 * 60 * 1000);
      
      MetricsCollector.endOperation("getQueryEmbedding", startTime, true, undefined, {
        queryLength: query.length,
        cached: false,
      });
      
      return embedding;
    } catch (error) {
      MetricsCollector.endOperation("getQueryEmbedding", startTime, false, (error as Error).message);
      throw error;
    }
  }

  async searchSimilar(query: string, topK: number = ragConfig.topK): Promise<DocumentReference[]> {
    const validation = Validator.validateQueryInput(query);
    if (!validation.valid) {
      logger.error("Invalid query input", new Error(validation.error));
      return [];
    }

    const topKValidation = Validator.validateTopK(topK);
    if (!topKValidation.valid) {
      logger.error("Invalid topK value", new Error(topKValidation.error));
      return [];
    }

    const startTime = MetricsCollector.startOperation("searchSimilar");
    
    try {
      const vector = await this.getQueryEmbedding(query);
      
      const searchBody = {
        size: topK,
        query: {
          knn: {
            text_vector: {
              vector: vector,
              k: topK,
            },
          },
        },
      };

      const response = await this.withRetry(
        async () => {
          return await this.openSearchClient.search({
            index: awsConfig.openSearch.index,
            body: searchBody,
          });
        },
        "searchSimilar"
      );

      const results = response.body.hits.hits.map((hit: any) => ({
        id: hit._id,
        content: hit._source.content,
        score: hit._score,
        source: hit._source.filepath || hit._source.title,
        metadata: {
          title: hit._source.title,
          source: hit._source.filepath,
          category: hit._source.category,
        },
      }));

      MetricsCollector.endOperation("searchSimilar", startTime, true, undefined, {
        resultCount: results.length,
        topK,
      });

      return results;
    } catch (error) {
      AWSErrorHandler.handle(error, "searchSimilar");
      MetricsCollector.endOperation("searchSimilar", startTime, false, (error as Error).message);
      return [];
    }
  }

  async generateResponse(
    query: string,
    context: DocumentReference[],
    history: ChatMessage[] = []
  ): Promise<string> {
    const validation = Validator.validateQueryInput(query);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const startTime = MetricsCollector.startOperation("generateResponse");
    
    try {
      const prompt = this.formatPrompt(query, context, history);
      
      const response = await this.withRetry(
        async () => {
          const input = {
            modelId: awsConfig.bedrock.modelId,
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({
              anthropic_version: "bedrock-2023-05-31",
              max_tokens: 2000,
              messages: [
                {
                  role: "user",
                  content: prompt,
                },
              ],
            }),
          };

          const command = new InvokeModelCommand(input);
          const response = await this.bedrockClient.send(command);
          const responseBody = JSON.parse(new TextDecoder().decode(response.body));
          return responseBody.content[0].text as string;
        },
        "generateResponse"
      );

      MetricsCollector.endOperation("generateResponse", startTime, true, undefined, {
        queryLength: query.length,
        contextDocs: context.length,
        responseLength: response.length,
      });

      return response;
    } catch (error) {
      MetricsCollector.endOperation("generateResponse", startTime, false, (error as Error).message);
      throw error;
    }
  }

  async saveMessage(conversationId: string, message: ChatMessage): Promise<void> {
    const idValidation = Validator.validateConversationId(conversationId);
    if (!idValidation.valid) {
      throw new Error(idValidation.error);
    }

    const messageValidation = Validator.validateChatMessage(message);
    if (!messageValidation.valid) {
      throw new Error(messageValidation.error);
    }

    const startTime = MetricsCollector.startOperation("saveMessage");

    try {
      const command = new PutCommand({
        TableName: awsConfig.dynamoDB.tableName,
        Item: {
          PK: `CONV#${conversationId}`,
          SK: `MSG#${Date.now()}`,
          ...message,
          timestamp: new Date().toISOString(),
        },
      });

      await this.withRetry(
        () => this.dynamoDBClient.send(command),
        "saveMessage"
      );

      MetricsCollector.endOperation("saveMessage", startTime, true, undefined, {
        conversationId,
        messageRole: message.role,
      });
    } catch (error) {
      MetricsCollector.endOperation("saveMessage", startTime, false, (error as Error).message);
      throw error;
    }
  }

  async getHistory(conversationId: string): Promise<ChatMessage[]> {
    const idValidation = Validator.validateConversationId(conversationId);
    if (!idValidation.valid) {
      logger.error("Invalid conversation ID", new Error(idValidation.error));
      return [];
    }

    const startTime = MetricsCollector.startOperation("getHistory");

    try {
      const command = new QueryCommand({
        TableName: awsConfig.dynamoDB.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `CONV#${conversationId}`,
          ":sk": "MSG#",
        },
      });

      const response = await this.withRetry(
        () => this.dynamoDBClient.send(command),
        "getHistory"
      );

      const items = (response.Items || []) as ChatMessage[];
      
      MetricsCollector.endOperation("getHistory", startTime, true, undefined, {
        conversationId,
        messageCount: items.length,
      });

      return items;
    } catch (error) {
      AWSErrorHandler.handle(error, "getHistory");
      MetricsCollector.endOperation("getHistory", startTime, false, (error as Error).message);
      return [];
    }
  }

  private formatPrompt(query: string, context: DocumentReference[], history: ChatMessage[]): string {
    const contextText = context.length > 0 
      ? context.map((c, i) => `[Doc ${i+1}]: ${c.content}`).join("\n\n")
      : "Nenhum documento relevante encontrado.";

    const historyText = history.slice(-5).map(h => `${h.role === 'user' ? 'Usuário' : 'Assistente'}: ${h.content}`).join("\n");
    
    return `Você é um assistente virtual corporativo de alta performance. 
Sua tarefa é responder à pergunta do usuário baseando-se estritamente no contexto fornecido abaixo.

### CONTEXTO DE CONHECIMENTO:
${contextText}

### HISTÓRICO RECENTE:
${historyText}

### INSTRUÇÕES:
1. Se a resposta não estiver no contexto, diga educadamente que não possui essa informação específica.
2. Seja direto, profissional e conciso.
3. Cite as fontes se necessário (ex: "De acordo com o documento X...").

Pergunta do Usuário: ${query}

Resposta:`;
  }
}
