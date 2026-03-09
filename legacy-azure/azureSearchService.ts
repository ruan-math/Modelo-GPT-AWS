// Localização: lib/services/azureSearchService.ts

import { SearchClient, AzureKeyCredential, SearchResult } from "@azure/search-documents";
import { AzureOpenAI } from "openai";
import type { DocumentReference, DocumentMetadata } from "../types";
import { config } from "../config";
import { RAGServiceManager } from './ragServiceManager';
import { EnhancedDocumentProcessor } from './enhancedDocumentProcessor';

export class AzureSearchService {
  private client: SearchClient<any>;
  private enhancedProcessor: EnhancedDocumentProcessor;

  constructor() {
    this.assertConfig();
    this.client = new SearchClient(
      config.azureSearchEndpoint!,
      config.azureSearchIndex!,
      new AzureKeyCredential(config.azureSearchApiKey!)
    );
    this.enhancedProcessor = new EnhancedDocumentProcessor();
  }

  private assertConfig() {
    const missing: string[] = [];
    if (!config.azureSearchEndpoint) missing.push("AZURE_SEARCH_ENDPOINT");
    if (!config.azureSearchIndex) missing.push("AZURE_SEARCH_INDEX");
    if (!config.azureSearchApiKey) missing.push("AZURE_SEARCH_API_KEY");
    if (!config.azureOpenAIEmbeddingEndpoint) missing.push("AZURE_OPENAI_EMBEDDING_ENDPOINT");
    if (!config.azureOpenAIApiKey) missing.push("AZURE_OPENAI_API_KEY");
    if (!config.azureOpenAIApiVersion) missing.push("AZURE_OPENAI_API_VERSION");
    if (!config.azureOpenAIEmbeddingsDeployment) missing.push("AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT");

    if (missing.length) {
      console.error('Azure Search Service Configuration Error:', missing);
      throw new Error(
        `Missing Azure configuration: ${missing.join(", ")}. Please set them in .env.local`
      );
    }
  }

  private getAzureOpenAIEmbeddingsClient() {
    return new AzureOpenAI({
      endpoint: config.azureOpenAIEmbeddingEndpoint!,
      apiKey: config.azureOpenAIApiKey!,
      deployment: config.azureOpenAIEmbeddingsDeployment!,
      apiVersion: config.azureOpenAIApiVersion!,
    });
  }

  private async getQueryEmbedding(query: string): Promise<number[]> {
    const aoai = this.getAzureOpenAIEmbeddingsClient();
    const res = await aoai.embeddings.create({
      model: config.azureOpenAIEmbeddingsDeployment!,
      input: query,
    });
    return res.data[0].embedding as number[];
  }

  private enhanceQuery(query: string): string {
    const queryLower = query.toLowerCase();
    const enhancements = new Set<string>();
    const termMap: { [key: string]: string[] } = {
      "empenho": ["nota de empenho", "dotação orçamentária", "reserva de orçamento", "execução financeira"],
      "cadin": ["cadastro informativo", "créditos não quitados", "regularidade fiscal", "pendência"],
      "convenio": ["convênio", "termo de colaboração", "parceria", "ajuste", "instrumento", "Sistema de Monitoramento de Convênios", "SMC"],
      "smc": ["Sistema de Monitoramento de Convênios", "monitoramento de convênios", "convênios", "sistema monitoramento", "decreto 56.939/2023", "programa avançar"],
      "sistema de monitoramento": ["Sistema de Monitoramento de Convênios", "SMC", "monitoramento convênios", "decreto 56.939", "programa avançar"],
      "monitoramento convenios": ["Sistema de Monitoramento de Convênios", "SMC", "sistema monitoramento", "decreto 56.939/2023"],
      "licitacao": ["licitação", "edital", "chamamento público", "pregão", "concorrência", "lei 14133"],
      "prestacao de contas": ["prestação de contas", "relatório de execução", "comprovação de despesa"]
    };
    for (const term in termMap) {
      if (queryLower.includes(term)) {
        termMap[term].forEach(synonym => enhancements.add(synonym));
      }
    }
    if (enhancements.size > 0) {
      return `${query} ${Array.from(enhancements).join(' ')}`;
    }
    return query;
  }

  async searchSimilar(
    query: string,
    topK: number = 10,
    userType?: 'municipal' | 'state' | 'general',
    documentType?: string
  ): Promise<DocumentReference[]> {
    if (!query || query.trim().length === 0) {
      console.warn('Empty query provided to searchSimilar');
      return [];
    }

    if (topK <= 0 || topK > 100) {
      console.warn(`Invalid topK value: ${topK}. Using default value of 10.`);
      topK = 10;
    }

    // Cache implementation
    const cacheKey = RAGServiceManager.generateSearchCacheKey(query, topK);
    const cachedResults = RAGServiceManager.getCachedSearchResults(cacheKey);

    if (cachedResults) {
      console.log(`Cache hit for search query: "${query}"`);
      return cachedResults;
    }

    try {
      // Enhanced query processing with user type context
      const basicEnhanced = this.enhanceQuery(query);
      const contextEnhanced = this.enhancedProcessor.enhanceQueryWithContext(
        basicEnhanced,
        userType || 'general'
      );

      console.log(`Original: "${query}" | Basic Enhanced: "${basicEnhanced}" | Context Enhanced: "${contextEnhanced}"`);

      // Dynamic topK based on user type and query complexity
      const searchTopK = this.calculateOptimalTopK(topK, userType, contextEnhanced);

      const vector = await this.getQueryEmbedding(contextEnhanced);
      const vectorQuery = { value: vector, fields: "text_vector", k: searchTopK };

      const selectableFields: string[] = ["id", "title", "content", "filepath", "category"];

      // Construir filtros opcionais
      const filter = this.buildSearchFilters(documentType, userType);

      const searchOptions: any = {
        top: Math.min(searchTopK, 15), // Otimizado: limitar a 15 documentos
        select: selectableFields,
        includeTotalCount: false, // Otimizado: não incluir contagem total
        vectorQueries: [vectorQuery]
      };

      // Adicionar filtro se especificado
      if (filter) {
        searchOptions.filter = filter;
      }

      let searchResults;
      try {
        searchResults = await this.client.search(contextEnhanced, searchOptions);
      } catch (err: any) {
        console.error("Azure Search request failed:", err);
        // Fallback simplificado em caso de erro
        const fallbackOpts = { ...searchOptions };
        delete fallbackOpts.select;
        searchResults = await this.client.search(contextEnhanced, fallbackOpts);
      }

      const refs: DocumentReference[] = [];
      for await (const result of searchResults.results) {
        const doc = result.document;
        const sourceFile = doc.filepath || doc.title || "Fonte desconhecida";
        const metadata: DocumentMetadata = {
          chunk_id: doc.id || `chunk_${Date.now()}_${Math.random()}`,
          title: doc.title,
          source: sourceFile,
          filepath: doc.filepath,
          documentType: (sourceFile.split('.').pop() || '').toUpperCase(),
          category: doc.category,
          pageNumber: undefined,
        };

        refs.push({
          id: doc.id,
          content: doc.content || "",
          score: result.score || 0,
          rerankScore: result.rerankerScore,
          metadata,
          source: sourceFile
        });
      }

      // Score-based filtering and sorting
      const filteredRefs = refs
        .filter(ref => ref.score > 0.5) // Minimum relevance threshold
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, topK);

      // Cache the results
      RAGServiceManager.setCachedSearchResults(cacheKey, filteredRefs);

      return filteredRefs;
    } catch (error) {
      console.error('Error in searchSimilar:', error);
      throw new Error(`Failed to search documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calcula topK otimizado baseado no tipo de usuário e complexidade da query
   */
  private calculateOptimalTopK(
    requestedTopK: number,
    userType?: 'municipal' | 'state' | 'general',
    query?: string
  ): number {
    let multiplier = 1.5; // Default

    // Ajuste por tipo de usuário (baseado em advance_dinamic.py)
    if (userType === 'municipal') {
      multiplier = 2.0; // Usuários municipais precisam de mais opções
    } else if (userType === 'state') {
      multiplier = 1.8; // Usuários estaduais precisam de análise mais profunda
    }

    // Ajuste por complexidade da query
    if (query) {
      const complexTerms = ['sistema de monitoramento', 'prestação de contas', 'auditoria', 'convênio'];
      const hasComplexTerms = complexTerms.some(term => query.toLowerCase().includes(term));
      if (hasComplexTerms) {
        multiplier += 0.5;
      }
    }

    const optimizedTopK = Math.floor(requestedTopK * multiplier);
    return Math.min(Math.max(optimizedTopK, 15), 50);
  }

  /**
   * Constrói filtros de busca baseados nos parâmetros opcionais
   */
  private buildSearchFilters(documentType?: string, userType?: string): string | undefined {
    const filters: string[] = [];

    if (documentType) {
      filters.push(`category eq '${documentType}'`);
    }

    if (userType) {
      // Filtrar por público-alvo - assumindo que há um campo target_audience
      filters.push(`target_audience eq '${userType}' or target_audience eq 'geral'`);
    }

    return filters.length > 0 ? filters.join(' and ') : undefined;
  }

}

export default AzureSearchService;