/**
 * Exemplo Prático: Usar AWSRAGService com Todas as Melhorias
 * 
 * Este arquivo demonstra como usar o serviço completo com todas
 * as funcionalidades de logging, erro handling, validação, etc.
 */

import { AWSRAGService } from './lib/aws/services/awsRAGService';
import { logger } from './lib/aws/utils/logger';
import { AWSErrorHandler } from './lib/aws/utils/errorHandler';
import { MetricsCollector } from './lib/aws/utils/metrics';
import { SimpleCache, RateLimiter } from './lib/aws/utils/cache';

/**
 * Exemplo 1: Uso Básico com Error Handling
 */
async function exemplo1_BasicUsage() {
  const rag = new AWSRAGService();
  
  try {
    logger.info('Exemplo 1: Iniciando busca de documentos');
    
    const docs = await rag.searchSimilar('Como configurar AWS Bedrock?');
    
    logger.info('Documentos encontrados', { count: docs.length });
    
    return docs;
  } catch (error) {
    logger.error('Erro na busca', error as Error);
    throw error;
  }
}

/**
 * Exemplo 2: Processamento Completo de Query com Histórico
 */
async function exemplo2_ProcessUserQuery(userId: string, userQuery: string) {
  const rag = new AWSRAGService();
  const startTime = MetricsCollector.startOperation('processUserQuery');
  
  try {
    // 1. Validação (automática dentro do serviço)
    logger.info('Processando query do usuário', { userId, queryLength: userQuery.length });
    
    // 2. Buscar documentos relevantes
    // Nota: O embedding é automaticamente cacheado por 30 minutos
    const relevantDocs = await rag.searchSimilar(userQuery, 10);
    logger.info('Busca concluída', { docsFound: relevantDocs.length });
    
    // 3. Recuperar histórico da conversa
    const history = await rag.getHistory(userId);
    logger.info('Histórico recuperado', { messages: history.length });
    
    // 4. Gerar resposta com contexto
    const response = await rag.generateResponse(userQuery, relevantDocs, history);
    logger.info('Resposta gerada', { responseLength: response.length });
    
    // 5. Salvar mensagens no histórico
    await rag.saveMessage(userId, { 
      role: 'user', 
      content: userQuery 
    });
    
    await rag.saveMessage(userId, { 
      role: 'assistant', 
      content: response 
    });
    
    logger.info('Mensagens salvas no histórico');
    
    MetricsCollector.endOperation('processUserQuery', startTime, true, undefined, {
      userId,
      docsUsed: relevantDocs.length,
      historySize: history.length,
    });
    
    return response;
    
  } catch (error) {
    // O erro é capturado, classificado e registrado
    const classified = AWSErrorHandler.handle(error, 'processUserQuery');
    
    logger.error('Erro ao processar query', error as Error, {
      errorType: classified.type,
      retryable: classified.retryable,
    });
    
    MetricsCollector.endOperation('processUserQuery', startTime, false, (error as Error).message);
    
    // Retornar resposta amigável em caso de erro
    return 'Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.';
  }
}

/**
 * Exemplo 3: Monitorar Performance
 */
async function exemplo3_MonitorPerformance() {
  const rag = new AWSRAGService();
  
  // Simular 5 buscas
  console.log('Executando 5 buscas...');
  
  for (let i = 0; i < 5; i++) {
    try {
      // Queries idênticas serão cacheadas (exceto a primeira)
      await rag.searchSimilar('AWS Bedrock models');
      logger.info(`Busca ${i + 1} completada`);
    } catch (error) {
      logger.error(`Busca ${i + 1} falhou`, error as Error);
    }
  }
  
  // Análise de performance
  console.log('\n📊 MÉTRICAS DE PERFORMANCE:');
  console.log('================================');
  
  const searchMetrics = MetricsCollector.getMetricsByOperation('searchSimilar');
  const avgDuration = MetricsCollector.getAverageDuration('searchSimilar');
  
  console.log(`Total de buscas: ${searchMetrics.length}`);
  console.log(`Tempo médio: ${avgDuration.toFixed(2)}ms`);
  console.log(`Sucessos: ${searchMetrics.filter(m => m.success).length}`);
  console.log(`Falhas: ${searchMetrics.filter(m => !m.success).length}`);
  
  // Note: A primeira busca é mais lenta (gera embedding)
  // As seguintes são mais rápidas (usam cache)
  console.log('\nDetalhes de cada busca:');
  searchMetrics.forEach((metric, i) => {
    console.log(`  ${i + 1}. ${metric.duration}ms - ${metric.success ? '✅' : '❌'}`);
  });
}

/**
 * Exemplo 4: Tratamento de Erros Específicos
 */
async function exemplo4_ErrorHandling() {
  const rag = new AWSRAGService();
  
  try {
    // Isso vai gerar um erro de validação
    await rag.searchSimilar(''); // Query vazia
  } catch (error) {
    const classified = AWSErrorHandler.classify(error);
    
    console.log('\n🔍 CLASSIFICAÇÃO DE ERRO:');
    console.log('===========================');
    console.log(`Tipo: ${classified.type}`);
    console.log(`Mensagem: ${classified.message}`);
    console.log(`Retryable: ${classified.retryable}`);
    console.log(`Status Code: ${classified.statusCode || 'N/A'}`);
  }
}

/**
 * Exemplo 5: Conversa Completa em String Única
 */
async function exemplo5_CompleteConversation() {
  const rag = new AWSRAGService();
  const userId = 'user-123';
  
  const responses: string[] = [];
  
  // Simular conversa
  const queries = [
    'O que é DynamoDB?',
    'Como fazer queries no DynamoDB?',
    'Quais são as limitações?'
  ];
  
  console.log('\n💬 SIMULANDO CONVERSA:');
  console.log('=======================');
  
  for (const query of queries) {
    logger.info(`User: ${query}`);
    console.log(`User: ${query}`);
    
    const response = await exemplo2_ProcessUserQuery(userId, query);
    responses.push(response);
    
    logger.info(`Assistant: ${response.substring(0, 50)}...`);
    console.log(`Assistant: ${response.substring(0, 100)}...\n`);
  }
  
  return responses;
}

/**
 * Exemplo 6: Usar Cache Manualmente
 */
async function exemplo6_ManualCache() {
  const cache = new SimpleCache<string>();
  
  console.log('\n📦 TESTE DE CACHE:');
  console.log('==================');
  
  // Set a value
  cache.set('config-key', 'my-config-value', 5 * 60 * 1000);
  console.log('✓ Set cache: config-key = my-config-value (5 min TTL)');
  
  // Get the value
  const value = cache.get('config-key');
  console.log(`✓ Get cache: config-key = ${value}`);
  
  // Check status
  const stats = cache.getStats();
  console.log(`Cache stats: ${stats.size} items, keys: [${stats.keys.join(', ')}]`);
  
  // Cleanup
  cache.destroy();
  console.log('✓ Cache destroyed');
}

/**
 * Exemplo 7: Usar Rate Limiter
 */
async function exemplo7_RateLimiter() {
  const limiter = new RateLimiter(5, 1000); // 5 requests per second
  
  console.log('\n🚦 TESTE DE RATE LIMITER:');
  console.log('=========================');
  
  // Try to send 3 requests immediately
  for (let i = 0; i < 3; i++) {
    if (limiter.canRequest()) {
      console.log(`Request ${i + 1}: ✅ Allowed`);
    } else {
      console.log(`Request ${i + 1}: ❌ Blocked`);
    }
  }
  
  console.log(`Status: ${JSON.stringify(limiter.getStatus())}`);
}

/**
 * Main: Executar Exemplos
 */
async function main() {
  console.log('🚀 EXEMPLOS DE USO: Model-GPT Enterprise AWS\n');
  
  try {
    // Comentar/descomentar para testar cada exemplo
    
    // await exemplo1_BasicUsage();
    // await exemplo2_ProcessUserQuery('user-1', 'Qual é a diferença entre cache e TTL?');
    // await exemplo3_MonitorPerformance();
    // await exemplo4_ErrorHandling();
    // await exemplo5_CompleteConversation();
    // await exemplo6_ManualCache();
    // await exemplo7_RateLimiter();
    
    console.log('\n✅ Exemplos carregados! Descomente as funções para executar.');
  } catch (error) {
    logger.error('Erro ao executar exemplos', error as Error);
  }
}

// Executar se rodado direto
void main();

export {
  exemplo1_BasicUsage,
  exemplo2_ProcessUserQuery,
  exemplo3_MonitorPerformance,
  exemplo4_ErrorHandling,
  exemplo5_CompleteConversation,
  exemplo6_ManualCache,
  exemplo7_RateLimiter,
};
