import { ChatOpenAI } from '@langchain/openai';
import { AzureChatOpenAI } from "@langchain/openai";
import { BaseMessage, HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { LLMModelConfig, RetryConfig, ChatMessage, DocumentReference } from '../types';
import { config, ragConfig } from '../config';

interface LLMResponse {
  content: string;
  model: {
    id: string;
    responseId: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    finishReason: string;
  };
  processingTime: number;
  startTime: string;
  endTime: string;
}

interface ModelHealth {
  available: boolean;
  lastFailure?: number; // timestamp do último erro
  failCount: number;
}

export class LLMService {
  private models: Map<string, ChatOpenAI | AzureChatOpenAI> = new Map();
  private modelConfigs: LLMModelConfig[];
  private retryConfig: RetryConfig;
  private modelHealth: Map<string, ModelHealth> = new Map();
  private cooldownMs = 2 * 60 * 1000; // 2 min de cooldown para modelos que falham

  constructor() {
    this.modelConfigs = ragConfig.models.filter(model => model.isAvailable);
    this.retryConfig = ragConfig.retryConfig;
    this.initializeModels();
  }

  private log(level: "info" | "error" | "warn", message: string, data?: any) {
    console.log(JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...data }));
  }

  private initializeModels(): void {
    for (const modelConfig of this.modelConfigs) {
      if (modelConfig.provider === 'openai') {
        const model = new ChatOpenAI({
          openAIApiKey: config.openaiApiKey,
          modelName: modelConfig.name,
          temperature: modelConfig.temperature,
          maxTokens: modelConfig.maxTokens,
          timeout: 60000,
        });
        this.models.set(modelConfig.name, model);
      } else if (modelConfig.provider === 'azure') {
        const model = new AzureChatOpenAI({
          azureOpenAIApiKey: config.azureOpenAIApiKey,
          azureOpenAIApiInstanceName: config.azureOpenAIApiInstanceName,
          azureOpenAIApiVersion: config.azureOpenAIApiVersion,
          azureOpenAIApiDeploymentName: modelConfig.name,
          azureOpenAIEndpoint: config.azureOpenAIApiBaseEndpoint,
          temperature: modelConfig.temperature,
          maxTokens: modelConfig.maxTokens,
          timeout: 60000,
        });
        this.models.set(modelConfig.name, model);
      }
      this.modelHealth.set(modelConfig.name, { available: true, failCount: 0 });
      this.log("info", "Model initialized", { name: modelConfig.name, provider: modelConfig.provider });
    }
    this.log("info", "Finished initializing models", { count: this.models.size });
  }

  async generateResponse(
    query: string,
    context: DocumentReference[],
    conversationHistory: ChatMessage[] = [],
    streaming = false,
    isFirstQuestion = false
  ): Promise<LLMResponse> {
    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }

    if (this.isAmbiguousQuery(query)) {
      return {
        content: `Prezado(a),\n\nPara fornecer uma resposta mais precisa, poderia especificar qual a sua dúvida sobre "${query}"? (Ex: como consultar, como regularizar um débito, etc.)\n\nAtenciosamente,\nCAGE-RS`,
        model: { id: "heuristic", responseId: crypto.randomUUID(), finishReason: "ambiguous" },
        processingTime: 0,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
      };
    }

    const availableModels = this.modelConfigs
      .sort((a, b) => a.priority - b.priority)
      .filter(config => this.isModelAvailable(config.name));

    if (availableModels.length === 0) {
      this.log("error", "No available models to process request.");
      throw new Error('No available models configured');
    }

    let lastError: Error | null = null;

    for (const modelConfig of availableModels) {
      const model = this.models.get(modelConfig.name)!;
      try {
        this.log("info", "Attempting to generate response", { model: modelConfig.name });
        const response = await this.callModelWithRetry(
          model,
          modelConfig.name,
          query,
          context,
          conversationHistory,
          streaming,
          isFirstQuestion
        );
        return response;
      } catch (error) {
        this.log("error", "Model failed execution", { model: modelConfig.name, error: (error as Error).message });
        this.markModelFailure(modelConfig.name);
        lastError = error as Error;
        continue;
      }
    }
    throw new Error(`All models failed. Last error: ${lastError?.message}`);
  }

  private async callModelWithRetry(
    model: ChatOpenAI | AzureChatOpenAI,
    modelName: string,
    query: string,
    context: DocumentReference[],
    conversationHistory: ChatMessage[],
    streaming: boolean,
    isFirstQuestion = false
  ): Promise<LLMResponse> {
    let attempt = 0;
    let delay = this.retryConfig.initialDelay;

    while (attempt < this.retryConfig.maxRetries) {
      try {
        const startTime = new Date().toISOString();
        const startTimeMs = Date.now();
        const messages = this.buildMessages(query, context, conversationHistory, isFirstQuestion);

        const response = await model.invoke(messages);

        const endTime = new Date().toISOString();
        const processingTime = Date.now() - startTimeMs;

        this.markModelSuccess(modelName);

        return {
          content: response.content as string,
          model: {
            id: modelName,
            responseId: response.id || crypto.randomUUID(),
            usage: response.response_metadata?.tokenUsage ? {
              promptTokens: response.response_metadata.tokenUsage.promptTokens || 0,
              completionTokens: response.response_metadata.tokenUsage.completionTokens || 0,
              totalTokens: response.response_metadata.tokenUsage.totalTokens || 0,
            } : undefined,
            finishReason: (response.response_metadata?.finish_reason as string) || 'stop',
          },
          processingTime,
          startTime,
          endTime,
        };
      } catch (error) {
        attempt++;
        this.log("warn", "Model call attempt failed", {
          model: modelName,
          attempt,
          error: (error as Error).message,
        });

        if (attempt >= this.retryConfig.maxRetries) {
          throw error;
        }

        const jitter = Math.random() * 0.1 * delay;
        await this.sleep(delay + jitter);
        delay = Math.min(delay * this.retryConfig.backoffMultiplier, this.retryConfig.maxDelay);
      }
    }
    throw new Error(`Max retries exceeded for model ${modelName}`);
  }

  private buildMessages(
    query: string,
    context: DocumentReference[],
    conversationHistory: ChatMessage[],
    isFirstQuestion = false
  ): BaseMessage[] {
    const messages: BaseMessage[] = [new SystemMessage(this.getSystemPrompt())];
    const recentHistory = conversationHistory.slice(-10);
    for (const message of recentHistory) {
      messages.push(message.role === 'user' ? new HumanMessage(message.content) : new AIMessage(message.content));
    }
    const contextText = this.formatContext(context);
    const prompt = this.buildUserPrompt(query, contextText, isFirstQuestion);
    messages.push(new HumanMessage(prompt));
    return messages;
  }

  private getSystemPrompt(): string {
    return `Você é o CageGPT, assistente virtual da CAGE-RS.

## OBJETIVO:
Fornecer respostas DIRETAS, CONCISAS e PRECISAS sobre convênios, prestação de contas, execução, habilitação e formalização da CAGE-RS.

## REGRAS:
1. **Seja direto**: Vá direto ao ponto, sem repetir a pergunta
2. **Seja conciso**: Máximo 3-4 parágrafos para respostas simples
3. **Cite fontes**: Mencione o documento usado quando aplicável
4. **Use formatação**: **Negrito** para info crítica, listas só quando necessário
5. **Escopo**: Só temas CAGE-RS. Se fora do escopo: "Esta questão não faz parte do escopo da CAGE-RS."

## FORMATO:
Prezado(a),

[Resposta direta em 2-3 parágrafos]

Atenciosamente,
CAGE-RS

**IMPORTANTE**: Evite respostas longas e repetitivas. Seja objetivo.`;
  }

  private buildUserPrompt(query: string, contextText: string, isFirstQuestion = false): string {
    // Usar o buildUserPrompt oficial do systemPrompt.ts para consistência
    const { buildUserPrompt } = require('../prompts/systemPrompt');
    return buildUserPrompt(query, contextText, isFirstQuestion);
  }

  private formatContext(context: DocumentReference[]): string {
    if (!context || context.length === 0) {
      return "Nenhum documento relevante encontrado na base de conhecimento da CAGE-RS.";
    }
    return context
      .map((ref, index) => {
        const source = ref.metadata?.source || ref.metadata?.title || 'Documento sem identificação';
        const pageInfo = ref.metadata?.pageNumber ? ` (Página ${ref.metadata.pageNumber})` : '';
        return `[${index + 1}] **${source}${pageInfo}**\n${ref.content}`;
      })
      .join('\n\n');
  }

  private isAmbiguousQuery(query: string): boolean {
    const ambiguousPatterns = [
      /^(como|o que|qual|onde|quando|quanto|quem)\s*(é|são|fica|fica|tem|faz)?\s*$/i,
      /^(sim|não|ok|certo)$/i,
    ];
    return ambiguousPatterns.some(pattern => pattern.test(query.trim()));
  }

  private isModelAvailable(modelName: string): boolean {
    const health = this.modelHealth.get(modelName);
    if (!health || health.available) return true;

    const now = Date.now();
    if (health.lastFailure && (now - health.lastFailure) > this.cooldownMs) {
      this.log("info", "Model cooldown expired, marking as available", { model: modelName });
      health.available = true;
      health.failCount = 0;
      return true;
    }
    return false;
  }

  private markModelFailure(modelName: string): void {
    const health = this.modelHealth.get(modelName);
    if (!health) return;

    health.failCount++;
    health.lastFailure = Date.now();

    if (health.failCount >= 3) {
      this.log("warn", "Model marked as unavailable after consecutive failures", {
        model: modelName,
        failCount: health.failCount,
      });
      health.available = false;
    }
  }

  private markModelSuccess(modelName: string): void {
    const health = this.modelHealth.get(modelName);
    if (!health) return;

    health.available = true;
    health.failCount = 0;
    health.lastFailure = undefined;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retorna estatísticas dos modelos disponíveis
   */
  getModelStats() {
    const stats = [];
    for (const [modelName, health] of this.modelHealth.entries()) {
      stats.push({
        name: modelName,
        available: health.available,
        failCount: health.failCount,
        lastFailure: health.lastFailure,
        provider: this.modelConfigs.find(m => m.name === modelName)?.provider || 'unknown',
      });
    }
    return stats;
  }

  /**
   * Testa a disponibilidade de todos os modelos
   */
  async testModels() {
    const results = [];
    for (const config of this.modelConfigs) {
      const model = this.models.get(config.name);
      if (!model) {
        results.push({ name: config.name, status: 'not_initialized', available: false });
        continue;
      }

      try {
        // Teste simples com timeout curto
        const testMessage = [new SystemMessage('Test'), new HumanMessage('Ping')];
        await Promise.race([
          model.invoke(testMessage),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        results.push({ name: config.name, status: 'healthy', available: true });
      } catch (error) {
        results.push({
          name: config.name,
          status: 'unhealthy',
          available: false,
          error: (error as Error).message
        });
      }
    }
    return results;
  }
}
