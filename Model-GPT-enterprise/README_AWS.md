# Model-GPT Enterprise - AWS

Este documento descreve a arquitetura e implementação do sistema **Model-GPT Enterprise** na **Amazon Web Services (AWS)**, garantindo uma solução limpa, escalável e de alta performance em ambiente cloud.

## 📋 Pré-requisitos

- **Node.js** 18+ e **npm** ou **yarn**
- Conta AWS com permissões para:
  - Amazon Bedrock
  - Amazon OpenSearch Service
  - Amazon DynamoDB
  - Amazon S3 (opcional)
- AWS CLI configurado com credenciais válidas
- Conhecimento básico de TypeScript e AWS

## 🚀 Instalação

1. **Clone o repositório:**
   ```bash
   git clone <repository-url>
   cd Model-GPT-enterprise
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente:**
   ```bash
   cp .env.aws .env
   # Edite o .env com suas configurações AWS
   ```

## 🏗️ Arquitetura AWS

A tabela abaixo descreve os principais componentes da solução:

| Componente | Serviço AWS |
| :--- | :--- |
| **LLM (Chat)** | **Amazon Bedrock** (Claude 3 Sonnet) |
| **Embeddings** | **Amazon Bedrock** (Titan Text Embeddings v2) |
| **Vector Store** | **Amazon OpenSearch Service** (k-NN) |
| **Banco de Dados** | **Amazon DynamoDB** |
| **Autenticação** | **Amazon Cognito** |
| **Hospedagem** | **AWS App Runner** ou **Amazon ECS** |
| **Storage** | **Amazon S3** |

---

## 🛠️ Características Principais

### 1. Serviço Unificado AWS RAG
Foi implementado o `AWSRAGService` (`lib/aws/services/awsRAGService.ts`), que centraliza toda a lógica de inteligência artificial:
- **Busca Semântica:** Integração nativa com OpenSearch usando vetores gerados pelo Bedrock.
- **Geração de Resposta:** Utilização do Claude 3 (Anthropic) via Bedrock, oferecendo maior janela de contexto e precisão.
- **Persistência Eficiente:** Uso do DynamoDB com padrão *Single Table Design* para histórico de conversas.
- **Retry Automático:** Implementação de lógica de retry para maior resiliência.

### 2. Otimização de Performance
- **Embeddings Titan v2:** Redução de latência na geração de vetores.
- **OpenSearch k-NN:** Busca vetorial de baixa latência para grandes volumes de documentos.
- **DynamoDB:** Consultas de histórico otimizadas por chaves de partição (PK) e classificação (SK).

### 3. Melhorias de Confiabilidade e Observabilidade
- **Logging Estruturado:** Sistema de logging com níveis de severity (DEBUG, INFO, WARN, ERROR).
- **Tratamento de Erros Avançado:** Classificação automática de erros AWS com estratégias de retry específicas.
- **Validação de Inputs:** Validação rigorosa de todos os inputs para melhor segurança.
- **Coleta de Métricas:** Monitoramento automático de performance (latência, sucesso/falha de operações).
- **Cache Inteligente:** Embedding cache em memória para reduzir chamadas a APIs.
- **Rate Limiting:** Proteção contra throttling com token bucket algorithm.

---

## 📦 Estrutura do Projeto AWS

```
lib/
├── types.ts                    # Definições de tipos TypeScript
└── aws/
    ├── config/
    │   └── index.ts            # Configurações centralizadas AWS
    ├── services/
    │   └── awsRAGService.ts    # Serviço unificado RAG
    └── utils/
        ├── logger.ts           # Sistema de logging estruturado
        ├── errorHandler.ts     # Tratamento inteligente de erros AWS
        ├── validator.ts        # Validação de inputs
        ├── metrics.ts          # Coleta de métricas de performance
        └── cache.ts            # Cache em memória e rate limiting
.env.example                    # Template de variáveis de ambiente (veja para documentação completa)
.gitignore                      # Regras de versionamento
package.json                    # Dependências do projeto
README_AWS.md                   # Esta documentação
```

---



## 🛠️ Guia de Utilitários

### Logger - Sistema de Logging Estruturado

```typescript
import { logger, LogLevel } from './lib/aws/utils/logger';

// Diferentes níveis de log
logger.debug('Informação de debug', { variable: value });
logger.info('Operação iniciada', { userId: '123' });
logger.warn('Aviso de atenção', { threshold: 80 });
logger.error('Erro crítico', error, { context: 'data' });

// Configurar nível de log via variável de ambiente
// LOG_LEVEL=DEBUG,INFO,WARN,ERROR (padrão: INFO)
```

### Error Handler - Tratamento Inteligente de Erros

```typescript
import { AWSErrorHandler, AWSErrorType } from './lib/aws/utils/errorHandler';

try {
  // sua operação AWS
} catch (error) {
  const classified = AWSErrorHandler.classify(error);
  
  // Tipos de erro: THROTTLING, VALIDATION, NOT_FOUND, UNAUTHORIZED, SERVICE_UNAVAILABLE
  if (classified.type === AWSErrorType.THROTTLING) {
    console.log('Rate limit - fazer retry');
  }
  
  // Ou usar helper
  if (AWSErrorHandler.isRetryable(error)) {
    // Retry automático é aplicado internamente
  }
}
```

### Validator - Validação de Inputs

```typescript
import { Validator } from './lib/aws/utils/validator';

// Validar query de usuário
const validation = Validator.validateQueryInput(userQuery);
if (!validation.valid) {
  console.error('Query inválida:', validation.error);
}

// Validar conversation ID
const idValidation = Validator.validateConversationId(conversationId);

// Validar mensagem de chat
const msgValidation = Validator.validateChatMessage(message);
```

### Metrics - Monitoramento de Performance

```typescript
import { MetricsCollector } from './lib/aws/utils/metrics';

const startTime = MetricsCollector.startOperation('meuOperacao');

// ... executar operação ...

MetricsCollector.endOperation('meuOperacao', startTime, success, error, {
  itemsProcessed: 100,
  duration: calculatedDuration
});

// Consultar métricas
const avgDuration = MetricsCollector.getAverageDuration('searchSimilar');
console.log(`Tempo médio de busca: ${avgDuration}ms`);

const allMetrics = MetricsCollector.getMetrics();
```

### Cache e Rate Limiter - Otimização e Proteção

```typescript
import { SimpleCache, RateLimiter } from './lib/aws/utils/cache';

// Cache com TTL
const cache = new SimpleCache<string>();
cache.set('key', 'value', 5 * 60 * 1000); // 5 minutos TTL
const cached = cache.get('key'); // null se expirado

// Rate limiter
const limiter = new RateLimiter(100, 1000); // 100 req/s

if (limiter.canRequest()) {
  // Fazer requisição
}

// Ou aguardar se necessário
await limiter.waitAndRequest();

// Status do rate limiter
console.log(limiter.getStatus()); // { available, capacity, utilization }
```

---

## ⚙️ Guia de Configuração na AWS

### 1. Amazon Bedrock
- Acesse o console do Bedrock e habilite os modelos:
  - **Anthropic Claude 3 Sonnet** (para chat).
  - **Amazon Titan Text Embeddings v2** (para busca vetorial).

### 2. Amazon OpenSearch
- Crie um domínio OpenSearch (ou use o modo Serverless).
- Crie um índice chamado `rag-index` com o seguinte mapeamento k-NN:
```json
{
  "settings": { "index": { "knn": true } },
  "mappings": {
    "properties": {
      "text_vector": { "type": "knn_vector", "dimension": 1536 },
      "content": { "type": "text" },
      "title": { "type": "keyword" }
    }
  }
}
```

### 3. Amazon DynamoDB
- Crie uma tabela chamada `EnterpriseGPT-Conversations`.
- **Chave de Partição (Partition Key):** `PK` (String).
- **Chave de Classificação (Sort Key):** `SK` (String).

---

## 📝 Exemplo de Uso no Código

```typescript
import { AWSRAGService } from './lib/aws/services/awsRAGService';

const rag = new AWSRAGService();

async function processUserQuery(userId: string, query: string) {
  try {
    // 1. Busca documentos relevantes no OpenSearch
    const docs = await rag.searchSimilar(query);
    
    // 2. Recupera histórico da conversa do DynamoDB
    const history = await rag.getHistory(userId);
    
    // 3. Gera resposta inteligente com Claude 3 no Bedrock
    const response = await rag.generateResponse(query, docs, history);
    
    // 4. Salva as mensagens no histórico
    await rag.saveMessage(userId, { role: 'user', content: query });
    await rag.saveMessage(userId, { role: 'assistant', content: response });
    
    return response;
  } catch (error) {
    console.error('Erro ao processar query:', error);
    return 'Desculpe, ocorreu um erro ao processar sua solicitação.';
  }
}
```

## 🔧 Desenvolvimento

### Scripts Disponíveis

```bash
npm run dev          # Inicia o servidor de desenvolvimento
npm run build        # Compila o projeto para produção
npm run start        # Inicia o servidor de produção
npm run lint         # Executa o linter
```

### Testes

```bash
npm run test         # Executa os testes
```

## 🐛 Troubleshooting

### Problemas Comuns

1. **Erro de Conexão com OpenSearch:**
   - Verifique se o endpoint está correto em `.env`
   - Certifique-se de que o domínio OpenSearch está acessível

2. **Erro no Bedrock:**
   - Confirme se os modelos estão habilitados no console AWS
   - Verifique as permissões IAM

3. **Erro no DynamoDB:**
   - Valide o nome da tabela
   - Confirme as chaves de partição/classificação

### Logs e Debug

O sistema utiliza console logging em formato estruturado (JSON). Para debug avançado, configure variáveis de ambiente:
```env
LOG_LEVEL=debug
NODE_ENV=development
```

Os logs incluem:
- **Timestamp** - Data e hora da operação
- **Level** - DEBUG, INFO, WARN, ERROR
- **Message** - Descrição do evento
- **Context** - Dados adicionais estruturados
- **Error** - Mensagem de erro (se aplicável)

### Monitoramento de Performance

Acesse métricas em tempo real:

```typescript
import { MetricsCollector } from './lib/aws/utils/metrics';

// Tempo médio das operações realizadas
console.log('Busca:', MetricsCollector.getAverageDuration('searchSimilar'), 'ms');
console.log('Geração:', MetricsCollector.getAverageDuration('generateResponse'), 'ms');

// Todas as métricas
const metrics = MetricsCollector.getMetrics();
console.log(`${metrics.length} operações registradas`);
```

---

## 📚 Best Practices

### 1. Validação de Inputs
Sempre validar inputs do usuário antes de processar:
```typescript
const validation = Validator.validateQueryInput(userInput);
if (!validation.valid) {
  throw new Error(validation.error);
}
```

### 2. Tratamento de Erros
Sempre capturar e classificar erros AWS:
```typescript
try {
  // operação AWS
} catch (error) {
  const classified = AWSErrorHandler.handle(error, 'operationName');
  if (classified.retryable) {
    // Retry logic (já aplicado em withRetry)
  }
}
```

### 3. Rate Limiting
Considere implementar rate limiting no frontend:
```typescript
// O service já tem rate limiting interno
// Mas você pode adicionar no nível da API REST
const limiter = new RateLimiter(50, 1000); // 50 req/s
await limiter.waitAndRequest();
```

### 4. Cache de Embeddings
Os embeddings são automaticamente cacheados por 30 minutos:
- Queries idênticas reutilizam embeddings em cache
- Reduz latência e custos de Bedrock
- Cache é automaticamente limpo após expiração

### 5. Histórico de Conversas
Use as métricas para monitorar performance:
- Consultas frequentes podem ser otimizadas
- Padrões de erro indicam problemas de configuração
- Latências ajudam a tunar topK e similarityThreshold

### 6. Segurança
- Nunca commitar `.env` com credenciais reais
- Use IAM roles em vez de keys de acesso diretas
- Validar todos os inputs de usuário
- Usar OpenSearch com autenticação (recomendado)

---## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para detalhes.

---

**Nota Final:** Esta versão foi otimizada com:
- ✅ Zero referências a Azure
- ✅ Logging estruturado com múltiplos níveis de severidade
- ✅ Tratamento inteligente de erros AWS com classificação automática
- ✅ Validação rigorosa de inputs para melhor segurança
- ✅ Coleta de métricas de performance em tempo real
- ✅ Cache de embeddings para reduzir latência e custos
- ✅ Rate limiting com token bucket algorithm integrado
- ✅ 100% compatível com o ecossistema AWS, seguindo as melhores práticas de arquitetura em nuvem
