// lib/rag/db/initCosmos.ts
import { CosmosClient } from "@azure/cosmos"
import { env } from "@/app/config/env"

const endpoint = env.NEXT_PUBLIC_COSMOSDB_ENDPOINT!
const key = env.NEXT_PUBLIC_COSMOSDB_PRIMARY_KEY!
const databaseId = env.NEXT_PUBLIC_COSMOSDB_DATABASE!
const prefix = env.NEXT_PUBLIC_COSMOSDB_CONTAINER_PREFIX!

const client = new CosmosClient({ endpoint, key })
const database = client.database(databaseId)

export async function createContainerIfNotExists(containerId: string) {
  // Define partition key based on container type
  let partitionKeyPath = "/userId" // default
  
  if (containerId === "attachments") {
    partitionKeyPath = "/chatId"
  } else if (containerId === "messages") {
    partitionKeyPath = "/conversationId"
  } else if (containerId === "citations") {
    partitionKeyPath = "/conversationId"
  }

  await database.containers.createIfNotExists({
    id: `${prefix}_${containerId}`,
    partitionKey: {
      paths: [partitionKeyPath]
    }
  })
}

// Cache to avoid re-initializing containers
let containersInitialized = false;

// Initialize all required containers (OTIMIZADO - paralelo)
export async function initializeAllContainers() {
  if (containersInitialized) {
    return; // Skip if already initialized
  }

  const containers = ['chats', 'messages', 'citations', 'feedbacks', 'llmjudgefeedbacks', 'attachments']

  console.log(`📦 Cosmos DB: Inicializando ${containers.length} containers em paralelo...`);
  const startTime = Date.now();

  // Cria todos os containers em paralelo para melhor performance
  await Promise.all(
    containers.map(containerId => createContainerIfNotExists(containerId))
  )

  const duration = Date.now() - startTime;
  containersInitialized = true;

  console.log(`✅ Cosmos DB: ${containers.length} containers inicializados com sucesso em ${duration}ms (modo paralelo)`);
  console.log(`   Containers: ${containers.map(c => prefix + '_' + c).join(', ')}`);
}
